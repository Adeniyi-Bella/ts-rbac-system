import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';

import { Profile, Strategy } from 'passport-google-oauth20';

export interface GoogleProfile {
  googleId: string;
  email: string;
  name: string;
  photo?: string;
}

interface GoogleRawProfileJson {
  email_verified?: boolean;
  picture?: string;
}

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(configService: ConfigService) {
    super({
      clientID: configService.getOrThrow<string>('appConfig.google.clientId'),
      clientSecret: configService.getOrThrow<string>(
        'appConfig.google.clientSecret',
      ),
      callbackURL: configService.getOrThrow<string>(
        'appConfig.google.callbackUrl',
      ),
      scope: ['profile', 'email'],
    });
  }

  public validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
  ): GoogleProfile {
    const email = profile.emails?.[0]?.value;
    const rawJson = profile._json as GoogleRawProfileJson;

    if (!email || rawJson.email_verified !== true) {
      throw new UnauthorizedException('Google account has no verified email');
    }

    return {
      googleId: profile.id,
      email,
      name: profile.displayName,
      photo: profile.photos?.[0]?.value ?? rawJson.picture,
    };
  }
}
