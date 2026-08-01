// import { applyDecorators, UseGuards, SetMetadata } from '@nestjs/common';
// import { SessionAuthGuard } from '../guards/session-auth.guard';
// import { FeatureGuard } from '../guards/feature.guard';
// export const FEATURE_KEY = 'required_feature';
// // FeatureGuard — we'll add this later once we resolve the circular dependency
// export const RequireFeature = (featureKey: string) =>
//   applyDecorators(
//     SetMetadata(FEATURE_KEY, featureKey),
//     UseGuards(SessionAuthGuard),
//   ); 

import { applyDecorators, UseGuards, SetMetadata } from '@nestjs/common';
import { SessionAuthGuard } from '../guards/session-auth.guard';
import { FeatureGuard } from '../guards/feature.guard';

export const FEATURE_KEY = 'required_feature';

export const RequireFeature = (featureKey: string) =>
  applyDecorators(
    SetMetadata(FEATURE_KEY, featureKey),
    UseGuards(SessionAuthGuard, FeatureGuard),
  );