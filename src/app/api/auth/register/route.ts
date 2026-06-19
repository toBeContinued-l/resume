import { getAppServices } from "@/server/app-services";
import { jsonError, jsonOk, readJsonObject } from "@/server/api/http";
import { MemoryMailProvider } from "@/server/mail/provider";

export async function POST(request: Request) {
  try {
    const body = await readJsonObject(request);
    const services = getAppServices();
    const result = await services.authService.register({
      email: String(body.email ?? ""),
      password: String(body.password ?? ""),
    });
    const latestVerification =
      services.mailProvider instanceof MemoryMailProvider
        ? services.mailProvider.findLatest("email_verification", result.user.email)
        : undefined;
    return jsonOk(
      {
        ...result,
        devVerificationCode:
          process.env.NODE_ENV !== "production" && latestVerification?.kind === "email_verification"
            ? latestVerification.code
            : undefined,
      },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}

export const dynamic = "force-dynamic";
