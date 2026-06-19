import Link from "next/link";
import React from "react";
import type { ReactNode } from "react";
import styles from "./legal.module.css";

type LegalSection = {
  title: string;
  body: ReactNode;
};

export const termsSections: LegalSection[] = [
  {
    title: "账号使用",
    body: (
      <>
        用户应使用真实、可接收邮件的邮箱注册账号，并妥善保管登录密码。账号仅供本人使用，
        不得转让、出借或用于侵犯他人权益的活动。系统会通过邮箱验证、登录会话和必要的安全校验保护账号。
      </>
    )
  },
  {
    title: "简历生成服务",
    body: (
      <>
        用户可上传 .doc、.docx 或 .pdf 简历文件用于解析、结构化整理、文案优化和网页排版生成。
        用户应确保上传内容由本人合法拥有或已获得授权。AI 只应基于已有信息优化表达，
        不应虚构学历、公司、岗位、项目、证书、工作年限等事实性经历。
      </>
    )
  },
  {
    title: "在线链接",
    body: (
      <>
        保存后的在线简历可使用公开访问、私密链接访问或密码访问模式。用户应根据简历内容敏感程度选择访问模式，
        并自行管理分享范围。密码访问模式下，访问者每次访问均需输入访问密码。
      </>
    )
  },
  {
    title: "用户责任",
    body: (
      <>
        用户应对其上传、编辑、保存和分享的简历内容负责，不得上传违法、侵权、虚假或恶意内容。
        用户删除简历记录后，对应在线链接将立即失效；如需继续分享，应重新生成或配置新的在线简历。
      </>
    )
  }
];

export const privacySections: LegalSection[] = [
  {
    title: "账号数据",
    body: (
      <>
        我们会处理注册邮箱、密码哈希、邮箱验证状态、登录会话和密码找回令牌等账号数据，
        用于创建账号、验证身份、维持登录状态和保护后台数据访问。密码、会话令牌、验证令牌和重置令牌不会明文持久化。
      </>
    )
  },
  {
    title: "简历文件上传用途",
    body: (
      <>
        用户上传的简历文件仅用于本服务的解析、结构化生成、在线编辑和在线简历展示。
        原始上传文件路径不会进入前端响应，也不会写入持久化的简历正文。
      </>
    )
  },
  {
    title: "原始文件临时保存与删除",
    body: (
      <>
        原始上传文件只在本地临时目录中短期保存，用于生成任务处理。任务生成完成、失败或重试耗尽后，
        系统会清理对应任务目录中的原始文件和中间文件。上传失败记录不保留。
      </>
    )
  },
  {
    title: "AI 服务使用",
    body: (
      <>
        生成过程中可能会调用隔离的 AI 服务 Provider 处理解析后的简历内容，以进行结构识别、措辞优化和排版建议。
        AI 输出必须经过服务端 Schema、安全和事实性后置校验后才能保存；不确定内容会进入待确认项。
      </>
    )
  },
  {
    title: "在线链接访问模式",
    body: (
      <>
        在线简历支持 public、private_link 和 password 三种访问模式。public 可被匿名访问；
        private_link 依赖链接本身访问；password 需要访问者每次输入访问密码。在线访问页面不会暴露后台编辑入口、
        用户管理信息或原始文件路径。
      </>
    )
  },
  {
    title: "删除规则与首期范围",
    body: (
      <>
        用户删除简历记录后，对应在线链接立即失效，相关简历内容、布局和链接配置不再用于在线访问。
        首期不提供一键删除所有账号数据的功能；用户可逐份删除简历记录，并可通过后续支持渠道处理账号级数据请求。
      </>
    )
  }
];

type LegalPageProps = {
  title: string;
  updatedAt: string;
  description: string;
  sections: LegalSection[];
};

export function LegalPage({ title, updatedAt, description, sections }: LegalPageProps) {
  return (
    <main className={styles.shell}>
      <article className={styles.document}>
        <nav className={styles.nav} aria-label="法律页面导航">
          <Link href="/">首页</Link>
          <Link href="/legal/terms">用户协议</Link>
          <Link href="/legal/privacy">隐私政策</Link>
        </nav>
        <p className="eyebrow">Legal</p>
        <h1>{title}</h1>
        <p className={styles.updated}>更新日期：{updatedAt}</p>
        <p className={styles.summary}>{description}</p>
        <div className={styles.sections}>
          {sections.map((section) => (
            <section key={section.title} className={styles.section}>
              <h2>{section.title}</h2>
              <p>{section.body}</p>
            </section>
          ))}
        </div>
      </article>
    </main>
  );
}
