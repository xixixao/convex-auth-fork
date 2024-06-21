import {
  Provider as AuthjsProviderConfig,
  CredentialsConfig,
  EmailConfig,
  OAuth2Config,
  OIDCConfig,
} from "@auth/core/providers";
import { WebAuthnConfig } from "@auth/core/providers/webauthn";
import { Theme } from "@auth/core/types";
import { ConvexCredentialsUserConfig } from "../providers/ConvexCredentials";
import { GenericActionCtx, GenericDataModel } from "convex/server";

/**
 * The config for the Convex Auth library, passed to `convexAuth`.
 */
export type ConvexAuthConfig = {
  /**
   * A list of authentication provider configs.
   *
   * You can import existing configs from
   * - `@auth/core/providers/<provider-name>`
   * - `@xixixao/convex-auth/providers/<provider-name>`
   */
  providers: AuthProviderConfig[];
  /**
   * Theme used for emails.
   * See [Auth.js theme docs](https://authjs.dev/reference/core/types#theme).
   */
  theme?: Theme;
  /**
   * Session configuration.
   */
  session?: {
    /**
     * How long can a user session last without the user reauthenticating.
     *
     * Defaults to 30 days.
     */
    totalDurationMs?: number;
    /**
     * How long can a user session last without the user being active.
     *
     * Defaults to 30 days.
     */
    inactiveDurationMs?: number;
  };
  /**
   * JWT configuration.
   */
  jwt?: {
    /**
     * How long is the JWT valid for after it is signed initially.
     *
     * Defaults to 1 hour.
     */
    durationMs?: number;
  };
  /**
   * Sign-in configuration.
   */
  signIn?: {
    /**
     * How many times can the user fail to provide the correct credentials
     * (password, OTP) per hour.
     *
     * Defaults to 10 times per hour.
     */
    maxFailedAttempsPerHour?: number;
  };
};

/**
 * Same as Auth.js provider configs, but adds phone provider
 * for verification via SMS or another phone-number-connected messaging
 * service.
 */
export type AuthProviderConfig =
  | Exclude<
      AuthjsProviderConfig,
      CredentialsConfig | ((...args: any) => CredentialsConfig)
    >
  | ConvexCredentialsConfig
  | ((...args: any) => ConvexCredentialsConfig)
  | PhoneConfig
  | ((...args: any) => PhoneConfig);

/**
 * Same as email provider config, but verifies
 * phone number instead of the email address.
 */
export interface PhoneConfig<
  DataModel extends GenericDataModel = GenericDataModel,
> {
  id: string;
  type: "phone";
  /**
   * Token expiration in seconds.
   */
  maxAge: number;
  /**
   * Send the phone number verification request.
   */
  sendVerificationRequest: (
    params: {
      identifier: string;
      url: string;
      expires: Date;
      provider: PhoneConfig;
      token: string;
    },
    ctx: GenericActionCtxWithAuthConfig<DataModel>,
  ) => Promise<void>;
  /**
   * Defaults to `process.env.AUTH_<PROVIDER_ID>_KEY`.
   */
  apiKey?: string;
  /**
   * Override this to generate a custom token.
   * Note that the tokens are assumed to be cryptographically secure.
   * Any tokens shorter than 24 characters are assumed to not
   * be secure enough on their own, and require providing
   * the original `phone` used in the initial `signIn` call.
   * @returns
   */
  generateVerificationToken?: () => Promise<string>;
  /**
   * Normalize the phone number.
   * @param identifier Passed as `phone` in params of `signIn`.
   * @returns The phone number used in `sendVerificationRequest`.
   */
  normalizeIdentifier?: (identifier: string) => string;
  options: PhoneUserConfig;
}

/**
 * Configurable options for a phone provider config.
 */
export type PhoneUserConfig = Omit<Partial<EmailConfig>, "options" | "type">;

/**
 * Similar to Auth.js Credentials config.
 */
export type ConvexCredentialsConfig = ConvexCredentialsUserConfig<any> & {
  type: "credentials";
  id: string;
};

/**
 * Your `ActionCtx` enriched with `ctx.auth.config` field with
 * the config passed to `convexAuth`.
 */
export type GenericActionCtxWithAuthConfig<DataModel extends GenericDataModel> =
  GenericActionCtx<DataModel> & {
    auth: { config: ConvexAuthMaterializedConfig };
  };

/**
 * The config for the Convex Auth library, passed to `convexAuth`,
 * with defaults and initialized providers.
 *
 * See {@link ConvexAuthConfig}
 */
export type ConvexAuthMaterializedConfig = {
  providers: AuthProviderMaterializedConfig[];
  theme: Theme;
  session?: {
    totalDurationMs?: number;
    inactiveDurationMs?: number;
  };
  jwt?: {
    durationMs?: number;
  };
};

/**
 * Materialized Auth.js provider config.
 */
export type AuthProviderMaterializedConfig =
  | OIDCConfig<any>
  | OAuth2Config<any>
  | EmailConfig
  | PhoneConfig
  | ConvexCredentialsConfig
  | WebAuthnConfig;
