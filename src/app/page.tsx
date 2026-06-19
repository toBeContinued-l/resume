import Link from "next/link";

export default function HomePage() {
  return (
    <main className="page-shell">
      <section className="hero-layout">
        <div className="hero-copy">
          <p className="eyebrow">ResumeCraft</p>
          <h1>把已有简历变成可编辑、可分享的在线页面</h1>
          <p>
            上传 Word 或 PDF 简历后，系统会解析内容、调用 AI 优化表达并生成网页排版。生成过程可跟踪、可终止，失败后可重试，最后进入编辑器确认内容并发布在线链接。
          </p>
          <div className="hero-actions">
            <Link className="button-link" href="/resumes/upload">上传简历</Link>
            <Link className="button-link secondary" href="/dashboard">查看历史记录</Link>
          </div>
          <nav className="flow-nav" aria-label="页面锚点">
            <Link href="#workflow">生成流程</Link>
            <Link href="#capabilities">功能能力</Link>
            <Link href="#limits">上传限制</Link>
          </nav>
        </div>

        <div className="entry-grid" aria-label="常用功能">
          <Link className="entry-card" href="/auth/register">
            <strong>1. 注册账号</strong>
            <span>邮箱收到验证码后回到注册页输入，不需要跳转验证链接。</span>
          </Link>
          <Link className="entry-card" href="/auth/login">
            <strong>2. 登录工作台</strong>
            <span>进入上传、历史记录和编辑管理。</span>
          </Link>
          <Link className="entry-card" href="/resumes/upload">
            <strong>3. 上传生成</strong>
            <span>支持 .doc、.docx、.pdf，生成过程展示阶段进度。</span>
          </Link>
          <Link className="entry-card" href="/dashboard">
            <strong>4. 编辑发布</strong>
            <span>确认内容、手动编辑并生成公开或密码访问链接。</span>
          </Link>
        </div>
      </section>

      <section className="section-band" id="workflow">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Workflow</p>
            <h2>完整操作流程</h2>
          </div>
          <Link className="button-link secondary" href="/resumes/upload">开始上传</Link>
        </div>
        <div className="flow-grid">
          <article className="flow-step">
            <em>1</em>
            <strong>账号与验证码</strong>
            <span>邮箱注册后复制验证码回填，账号激活后进入上传页面。</span>
          </article>
          <article className="flow-step">
            <em>2</em>
            <strong>上传与生成</strong>
            <span>文件解析、AI 优化、排版生成分阶段展示，可终止，可在失败后重试。</span>
          </article>
          <article className="flow-step">
            <em>3</em>
            <strong>编辑与发布</strong>
            <span>在编辑器里修改内容、处理待确认项，并创建在线访问链接。</span>
          </article>
        </div>
      </section>

      <section className="section-band" id="capabilities">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Capabilities</p>
            <h2>核心能力</h2>
          </div>
        </div>
        <div className="metric-grid">
          <article className="metric">
            <strong>结构化解析</strong>
            <span>提取个人信息、经历、项目、技能和证书等模块。</span>
          </article>
          <article className="metric">
            <strong>AI 优化</strong>
            <span>优化措辞和在线展示排版，不虚构关键事实。</span>
          </article>
          <article className="metric">
            <strong>在线分享</strong>
            <span>支持公开、私密链接和密码访问三种分享模式。</span>
          </article>
        </div>
      </section>

      <section className="section-band" id="limits">
        <div className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Limits</p>
              <h2>上传限制</h2>
            </div>
            <Link className="button-link secondary" href="/legal/privacy">隐私政策</Link>
          </div>
          <p>
            每个账号最多保留 3 份未删除简历，单个文件不超过 15MB。原始上传文件仅用于本次解析和生成，成功或终止后会清理临时文件。
          </p>
        </div>
      </section>
    </main>
  );
}
