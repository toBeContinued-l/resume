import { UploadResumeForm } from "./upload-form";

export default function UploadResumePage() {
  return (
    <main className="app-shell">
      <div className="two-column">
        <aside className="panel">
          <p className="eyebrow">Generate</p>
          <h1>上传简历</h1>
          <p className="muted">
            上传后会依次完成排队、解析、AI 优化和在线排版。生成过程中可以查看阶段进度，必要时可终止；失败后可直接重试。
          </p>
          <div className="flow-nav">
            <a href="#upload">上传</a>
            <a href="#progress">进度</a>
            <a href="/dashboard">历史记录</a>
          </div>
        </aside>
        <section className="panel" id="upload">
          <div className="section-heading">
            <div>
              <p className="eyebrow">File</p>
              <h2>选择原始简历文件</h2>
            </div>
            <span className="status-badge">最多 3 份</span>
          </div>
          <p className="muted">支持 .doc、.docx、.pdf，单文件不超过 15MB。</p>
          <div id="progress">
            <UploadResumeForm />
          </div>
        </section>
      </div>
    </main>
  );
}
