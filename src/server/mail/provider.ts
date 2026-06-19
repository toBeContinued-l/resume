import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

export type MailMessageKind = "email_verification" | "password_reset";

export type EmailVerificationMail = {
  kind: "email_verification";
  to: string;
  token: string;
  verificationUrl?: string;
  code?: string;
  expiresInMinutes?: number;
};

export type PasswordResetMail = {
  kind: "password_reset";
  to: string;
  token: string;
  resetUrl: string;
};

export type MailMessage = EmailVerificationMail | PasswordResetMail;

export interface MailProvider {
  sendEmailVerification(message: Omit<EmailVerificationMail, "kind">): Promise<void>;
  sendPasswordReset(message: Omit<PasswordResetMail, "kind">): Promise<void>;
}

export class MemoryMailProvider implements MailProvider {
  readonly messages: MailMessage[] = [];

  async sendEmailVerification(message: Omit<EmailVerificationMail, "kind">): Promise<void> {
    this.messages.push({ kind: "email_verification", ...message });
  }

  async sendPasswordReset(message: Omit<PasswordResetMail, "kind">): Promise<void> {
    this.messages.push({ kind: "password_reset", ...message });
  }

  findLatest(kind: MailMessageKind, to?: string): MailMessage | undefined {
    return [...this.messages]
      .reverse()
      .find((message) => message.kind === kind && (to === undefined || message.to === to));
  }

  clear(): void {
    this.messages.length = 0;
  }
}

export type SmtpMailProviderOptions = {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
  from: string;
};

export class SmtpMailProvider implements MailProvider {
  private readonly transporter: Transporter;

  constructor(private readonly options: SmtpMailProviderOptions) {
    this.transporter = nodemailer.createTransport({
      host: options.host,
      port: options.port,
      secure: options.secure,
      auth: options.user && options.password ? { user: options.user, pass: options.password } : undefined,
    });
  }

  async sendEmailVerification(message: Omit<EmailVerificationMail, "kind">): Promise<void> {
    const codeText = message.code
      ? [
          `你的验证码是：${message.code}`,
          message.expiresInMinutes ? `验证码 ${message.expiresInMinutes} 分钟内有效。` : "验证码短时间内有效。",
          "",
        ]
      : [];
    const codeHtml = message.code
      ? [
          "<p>你的验证码是：</p>",
          `<p style="font-size:24px;font-weight:700;letter-spacing:4px;">${escapeHtml(message.code)}</p>`,
          `<p>${message.expiresInMinutes ? `验证码 ${message.expiresInMinutes} 分钟内有效。` : "验证码短时间内有效。"}</p>`,
        ]
      : [];

    await this.transporter.sendMail({
      from: this.options.from,
      to: message.to,
      subject: "验证你的在线简历账号",
      text: [
        ...codeText,
        "如果不是你本人操作，可以忽略这封邮件。",
      ].join("\n"),
      html: [
        ...codeHtml,
        "<p>如果不是你本人操作，可以忽略这封邮件。</p>",
      ].join(""),
    });
  }

  async sendPasswordReset(message: Omit<PasswordResetMail, "kind">): Promise<void> {
    await this.transporter.sendMail({
      from: this.options.from,
      to: message.to,
      subject: "重置你的在线简历账号密码",
      text: [
        "请打开下面的链接重置密码：",
        message.resetUrl,
        "",
        "如果不是你本人操作，可以忽略这封邮件。",
      ].join("\n"),
      html: [
        "<p>请打开下面的链接重置密码：</p>",
        `<p><a href="${escapeHtml(message.resetUrl)}">${escapeHtml(message.resetUrl)}</a></p>`,
        "<p>如果不是你本人操作，可以忽略这封邮件。</p>",
      ].join(""),
    });
  }
}

export function createMailProviderFromEnv(): MailProvider {
  if (process.env.MAIL_PROVIDER !== "smtp") {
    return new MemoryMailProvider();
  }

  const host = requiredEnv("SMTP_HOST");
  const port = Number(process.env.SMTP_PORT ?? 587);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("SMTP_PORT must be a positive integer.");
  }

  return new SmtpMailProvider({
    host,
    port,
    secure: process.env.SMTP_SECURE === "true" || port === 465,
    user: process.env.SMTP_USER,
    password: process.env.SMTP_PASSWORD,
    from: process.env.MAIL_FROM || process.env.SMTP_USER || "no-reply@example.com",
  });
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required when MAIL_PROVIDER=smtp.`);
  }
  return value;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
