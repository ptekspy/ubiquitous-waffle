import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { emailOTP } from "better-auth/plugins";

import { prisma } from "@/lib/db/prisma";

function betterAuthUrl(): string {
  return process.env.BETTER_AUTH_URL || "http://localhost:3000";
}

export const auth = betterAuth({
  baseURL: betterAuthUrl(),
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
    autoSignIn: false,
    requireEmailVerification: true,
  },
  plugins: [
    emailOTP({
      overrideDefaultEmailVerification: true,
      sendVerificationOnSignUp: true,
      otpLength: 6,
      expiresIn: 10 * 60,
      async sendVerificationOTP({ email, otp, type }) {
        console.info("\n[PaidPolitely auth]");
        console.info(`Email: ${email}`);
        console.info(`Type: ${type}`);
        console.info(`Verification code: ${otp}`);
        console.info("\n");
      },
    }),
  ],
});
