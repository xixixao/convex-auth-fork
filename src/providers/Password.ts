/**
 * Configure {@link Password} provider given a {@link PasswordConfig}.
 *
 * ```ts
 * import Password from "@xixixao/convex-auth/providers/Password";
 * import { convexAuth } from "@xixixao/convex-auth/server";
 *
 * export const { auth, signIn, verifyCode, signOut, store } = convexAuth({
 *   providers: [Password],
 * });
 * ```
 *
 * @module
 */

import { EmailConfig } from "@auth/core/providers";
import ConvexCredentials, {
  ConvexCredentialsConfig,
} from "@xixixao/convex-auth/providers/ConvexCredentials";
import {
  GenericDoc,
  createAccountWithCredentials,
  invalidateSessions,
  modifyAccountCredentials,
  retrieveAccount,
  retrieveAccountWithCredentials,
  signInViaProvider,
  verifyCodeForSignIn,
} from "@xixixao/convex-auth/server";
import {
  DocumentByName,
  GenericDataModel,
  WithoutSystemFields,
} from "convex/server";
import { Value } from "convex/values";
import { Scrypt } from "lucia";

/**
 * The available options to a {@link Password} provider for Convex Auth.
 */
export interface PasswordConfig<DataModel extends GenericDataModel> {
  /**
   * Uniquely identifies the provider, allowing to use
   * multiple different {@link Password} providers.
   */
  id?: string;
  /**
   * Perform checks on provided params and customize the user
   * information stored after sign up, including email normalization.
   *
   * Called for every flow ("signUp", "signIn", "reset" and "reset-verification").
   *
   * @param params The values passed to the `signIn` or `verifyCode` function.
   */
  profile?: (params: Record<string, Value | undefined>) => WithoutSystemFields<
    DocumentByName<DataModel, "users">
  > & {
    email: string;
  };
  /**
   * Provide hashing and verification functions if you want to control
   * how passwords are hashed.
   */
  crypto?: ConvexCredentialsConfig["crypto"];
  /**
   * An Auth.js email provider used to require verification
   * before password reset.
   */
  reset?: EmailConfig | ((...args: any) => EmailConfig);
  /**
   * An Auth.js email provider used to require verification
   * before sign up / sign in.
   */
  verify?: EmailConfig | ((...args: any) => EmailConfig);
}

/**
 * Email and password authentication provider.
 *
 * Passwords are by default hashed using Scrypt from Lucia.
 * You can customize the hashing via the `crypto` option.
 *
 * Email verification is not required unless you pass
 * an email provider to the `verify` option.
 */
export default function Password<DataModel extends GenericDataModel>(
  config: PasswordConfig<DataModel> = {},
) {
  const provider = config.id ?? "password";
  return ConvexCredentials<DataModel>({
    id: "password",
    authorize: async (params, ctx) => {
      const profile = config.profile?.(params) ?? defaultProfile(params);
      const { email } = profile;
      const flow = params.flow as string;
      const secret = params.password as string;
      let account: GenericDoc<DataModel, "accounts">;
      let user: GenericDoc<DataModel, "users">;
      if (flow === "signUp") {
        const created = await createAccountWithCredentials(ctx, {
          provider,
          account: { id: email, secret },
          profile,
          shouldLink: config.verify !== undefined,
        });
        ({ account, user } = created);
      } else if (flow === "signIn") {
        const retrieved = await retrieveAccountWithCredentials(ctx, {
          provider,
          account: { id: email, secret },
        });
        if (retrieved === null) {
          throw new Error("Invalid credentials");
        }
        ({ account, user } = retrieved);
        // START: Optional, support password reset
      } else if (flow === "reset" && config.reset) {
        const retrieved = await retrieveAccount(ctx, {
          provider,
          account: { id: email },
        });
        if (retrieved === null) {
          throw new Error("Invalid credentials");
        }
        ({ account, user } = retrieved);
        return await signInViaProvider(ctx, config.reset, {
          accountId: account._id,
        });
        // END
      } else {
        throw new Error(
          "Missing `flow` param, it must be one of " +
            '"signUp", "signIn" or "reset"!',
        );
      }
      // START: Optional, email verification during sign in
      if (config.verify && !account.emailVerified) {
        return await signInViaProvider(ctx, config.verify, {
          accountId: account._id,
        });
      }
      // END
      return { id: user._id };
    },
    crypto: {
      async hashSecret(password: string) {
        return await new Scrypt().hash(password);
      },
      async verifySecret(password: string, hash: string) {
        return await new Scrypt().verify(hash, password);
      },
    },
    // START: Optional, support password reset
    verifyCode: async (params, ctx) => {
      const { flow } = params;
      if (flow === "reset-verification") {
        // Password validation
        config.profile?.(params) ?? defaultProfile(params);
      }
      const result = await verifyCodeForSignIn(
        ctx,
        params as { code: string; email?: string },
      );
      if (result === null) {
        throw new Error("Invalid code");
      }
      const { providerAccountId, userId, sessionId } = result;
      if (flow === "reset-verification") {
        const secret = params.newPassword as string;
        await modifyAccountCredentials(ctx, {
          provider,
          account: { id: providerAccountId, secret },
        });
        await invalidateSessions(ctx, { userId, except: [sessionId] });
      }
      return { userId, sessionId };
    },
    // END
    ...config,
  });
}

function defaultProfile(params: Record<string, unknown>) {
  const flow = params.flow as string;
  if (flow === "signUp" || flow === "reset-verification") {
    const password = (
      flow === "signUp" ? params.password : params.newPassword
    ) as string;
    if (!password || password.length < 8) {
      throw new Error("Invalid password");
    }
  }
  return {
    email: params.email as string,
  };
}
