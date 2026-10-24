import "server-only";
import nodemailer from "nodemailer";
import { getConfig } from "@/lib/config";
import { MAIL_TEMPLATE } from "@/constants/mail";
import type { MailTemplateValue } from "@/constants/mail";

export type { MailTemplateValue };

let transporter: nodemailer.Transporter | null = null;
let transporterKey = "";

/** SMTP 发信通道(配置存 system_config,配置变更后自动重建连接;dev 默认 Mailpit) */
export async function getTransporter(): Promise<nodemailer.Transporter> {
  const { smtp } = await getConfig();
  const key = JSON.stringify(smtp);
  if (!transporter || transporterKey !== key) {
    transporter?.close();
    transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.port === 465,
      auth: smtp.user
        ? { user: smtp.user, pass: smtp.password }
        : undefined,
    });
    transporterKey = key;
  }
  return transporter;
}

export type MailPayload = { link: string; username?: string };

export type RenderedMail = { subject: string; html: string; text: string };

function wrap(title: string, bodyHtml: string): RenderedMail {
  const html = `<div style="font-family:sans-serif;max-width:560px;margin:0 auto">
<h2 style="color:#3b82f6">老克塔 · ${title}</h2>
${bodyHtml}
<p style="color:#6b7280;font-size:12px">如非本人操作请忽略本邮件。此链接为一次性链接,请勿转发。</p>
</div>`;
  return { subject: `【老克塔】${title}`, html, text: `${title}: ${bodyHtml}` };
}

export function renderMail(
  template: MailTemplateValue,
  payload: MailPayload,
): RenderedMail {
  const who = payload.username ? `<p>你好,${payload.username}</p>` : "";
  switch (template) {
    case MAIL_TEMPLATE.ACTIVATE:
      return wrap(
        "激活你的账号",
        `${who}<p>点击下方链接设置密码并激活(24 小时内有效):</p>
<p><a href="${payload.link}">${payload.link}</a></p>`,
      );
    case MAIL_TEMPLATE.PASSWORD_RESET:
      return wrap(
        "重置密码",
        `${who}<p>点击下方链接设置新密码(30 分钟内有效):</p>
<p><a href="${payload.link}">${payload.link}</a></p>`,
      );
    case MAIL_TEMPLATE.EMAIL_CHANGE:
      return wrap(
        "确认新邮箱",
        `${who}<p>点击下方链接确认绑定新邮箱(24 小时内有效):</p>
<p><a href="${payload.link}">${payload.link}</a></p>`,
      );
  }
}
