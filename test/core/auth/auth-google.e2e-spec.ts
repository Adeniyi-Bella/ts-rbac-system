import {
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';

import { AppModule } from '../../../src/app.module';
import { GoogleAuthGuard } from '../../../src/core/auth/guards/google-auth.guard';
import { AuthProvider } from '../../../src/core/users/enums/user.enum';
import { UsersService } from '../../../src/core/users/services/users.service';
import { EmailService } from '../../../src/infrastructure/email/email.service';

type RequestWithGoogleProfile = Request & {
  user?: { googleId: string; email: string; name: string; photo?: string };
};

describe('AuthController Google OAuth (E2E)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let usersService: UsersService;

  let mockGoogleProfile: {
    googleId: string;
    email: string;
    name: string;
    photo?: string;
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(EmailService)
      .useValue({
        sendEmail: jest.fn().mockResolvedValue(null),
        sendVerificationEmail: jest.fn().mockResolvedValue(null),
      })
      .overrideGuard(GoogleAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext): boolean => {
          const req = context
            .switchToHttp()
            .getRequest<RequestWithGoogleProfile>();
          req.user = mockGoogleProfile;
          return true;
        },
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    await app.init();

    dataSource = moduleFixture.get(DataSource);
    usersService = moduleFixture.get(UsersService);
  });

  beforeEach(async () => {
    await dataSource.query('TRUNCATE TABLE refresh_tokens CASCADE;');
    await dataSource.query('TRUNCATE TABLE users CASCADE;');
    mockGoogleProfile = {
      googleId: 'g-e2e-12345',
      email: 'oauthuser@example.com',
      name: 'OAuth User',
      photo: 'https://photo.test/a.jpg',
    };
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates a new verified user on first Google login', async () => {
    const response = await request(app.getHttpServer())
      .get('/auth/google/callback')
      .expect(200);

    const body = response.body as {
      accessToken?: string;
      refreshToken?: string;
    };
    expect(body.accessToken).toEqual(expect.any(String));
    expect(body.refreshToken).toEqual(expect.any(String));

    const created = await usersService.findOneByEmail(mockGoogleProfile.email);
    expect(created).toEqual(
      expect.objectContaining({
        email: mockGoogleProfile.email,
        googleId: mockGoogleProfile.googleId,
        authProvider: AuthProvider.GOOGLE,
        isVerified: true,
        emailVerifiedAt: expect.any(Date) as Date,
      }),
    );
  });

  it('links Google to an existing local account with the matching email, resulting in exactly one row', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: mockGoogleProfile.email, password: 'password12345' })
      .expect(201);

    const beforeRows = await dataSource.query<{ count: number }[]>(
      'SELECT COUNT(*)::int as count FROM users WHERE email = $1',
      [mockGoogleProfile.email],
    );
    expect(beforeRows[0].count).toBe(1);

    await request(app.getHttpServer()).get('/auth/google/callback').expect(200);

    const afterRows = await dataSource.query<{ count: number }[]>(
      'SELECT COUNT(*)::int as count FROM users WHERE email = $1',
      [mockGoogleProfile.email],
    );
    expect(afterRows[0].count).toBe(1);

    const linked = await usersService.findOneByEmail(mockGoogleProfile.email);
    expect(linked).toEqual(
      expect.objectContaining({
        googleId: mockGoogleProfile.googleId,
        authProvider: AuthProvider.HYBRID,
        isVerified: true,
      }),
    );
  });

  it('does not create a duplicate row on repeated Google login', async () => {
    await request(app.getHttpServer()).get('/auth/google/callback').expect(200);
    await request(app.getHttpServer()).get('/auth/google/callback').expect(200);

    const rows = await dataSource.query<{ count: number }[]>(
      'SELECT COUNT(*)::int as count FROM users WHERE email = $1',
      [mockGoogleProfile.email],
    );
    expect(rows[0].count).toBe(1);
  });
});
