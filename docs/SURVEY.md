# 初始探测报告（语雀公开知识库）

- 目标：<https://www.yuque.com/nanxiao_fighters/afkiny>
- 探测时间：2026-11-02 / 11-03（Asia/Shanghai）
- 原则：**只访问匿名公开面**；未登录、未使用 Cookie/Token/密钥，未绕过任何访问控制。

## 1. 可访问性

| 检查 | 结果 |
| --- | --- |
| 知识库首页 HTTP 状态 | **200** |
| 是否需要登录 | 否（公开可读） |
| 页面类型 | 语雀知识库（`pagetype=bookOverview`） |
| 知识库名称 | 考研阅读大观 |
| 命名空间 | `nanxiao_fighters/afkiny` |
| book id | `84738584` |
| 公开设置 | `public: 1`，`enable_export: true`（但匿名导出接口 404） |
| 最近更新 | 2026-10-21 09:47 |

## 2. 文档数量与目录结构

TOC 共 **34 个节点，全部为 DOC**，两层结构：

```text
考研阅读大观
├─ 阅读英语一10-25   (qoczrawzn5m0grae)
│  ├─ 10年 … 25年    (16 篇)
└─ 阅读英语二10-25   (vn6zzcboe1eoohtk)
   └─ 10年 … 25年    (16 篇)
```

| 范围 | 文档数 | 是否收录 |
| --- | --- | --- |
| 英语一（分区页 + 2010–2025） | **17** | ✅ 本次全部处理 |
| 英语二（分区页 + 2010–2025） | 17 | ❌ 按要求排除，未进入 `raw/` 与 `content/` |

无更深的目录层级，无 TITLE 分组节点。

## 3. 正文形态

通过公开 JSON 接口 `GET /api/docs/{slug}?book_id=84738584` 读取 17 篇文档：

| 项 | 结果 |
| --- | --- |
| 正文字段 | `content`（语雀 lake HTML，`format=lake`） |
| 是否有普通段落文字 | 仅 2010 年有一句（B 站链接）；其余年份几乎为空 |
| 是否有图片 `<img>` | **0 张**（整个英一分区） |
| 正文主要由什么构成 | `<card name="localdoc">` 附件卡片 + `<card name="hr">` 分隔线 |
| 每篇年份页卡片数 | 11 个（8 个附件卡片 + 3 条分隔线） |
| `word_count` | 48–59（主要是附件名） |

结论：**年份页本身没有可读正文**，真正的资料是附件里的独立 HTML。

## 4. 附件

从 `content` 的 `localdoc` 卡片 `value`（URL 编码 JSON）解析：

| 项 | 结果 |
| --- | --- |
| 英一附件总数 | **128**（16 年 × 4 篇 × 做题/复盘） |
| 文件类型 | HTML（`text/html`） |
| 单文件大小 | 0.8–8.3 MB |
| 总体积 | **约 393.4 MB** |
| 图片依赖 | 附件内部可能含图片，但均属附件正文，未下载 |
| 附件是公开的吗 | **否** |

### 访问验证

匿名 GET `https://www.yuque.com/attachments/...`：

```text
HTTP 302 → /login?goto=https%3A%2F%2Fwww.yuque.com%2Fattachments%2F...
```

抽样 3 个附件（2010/2015/2025）结果一致；yuque-dl 对每个附件亦报：

```text
附件下载失败: "2010_text1_做题模式.html" need token
```

其他尝试（均为匿名）：

- 带访客 Cookie / Referer：仍 302 到登录页；
- `cdn.nlark.com/...` 直链：403；
- `/api/attachments/{id}`：404；
- 匿名导出 `/api/books/{id}/export`、`/api/repos/.../export`：404；
- 知识库 `abilities.export = false`。

## 5. 结论与处理方式

1. 公开可得：目录结构、标题、附件名、附件大小、原始链接、更新时间、2010 年的一句正文。
2. 不可得：128 份 HTML 的正文（需登录语雀）。
3. 本项目**不登录**，因此：
   - 站点包含全部公开元数据与来源标注；
   - 年份页提供完整资料清单与原始链接；
   - 附件正文不伪造、不转存；
   - 站内「附件清单」页与 `raw/manifest.json`、`raw/attachments.csv` 保留 128 条完整记录。

## 6. 复现方法

```bash
# 元数据 + 附件可访问性抽查（匿名）
node scripts/fetch-yuque.mjs

# 正文 Markdown（yuque-dl，匿名；会提示附件 need token）
npx yuque-dl "https://www.yuque.com/nanxiao_fighters/afkiny" -d download --toc
```

辅助证据文件：`raw/manifest.json`（附件抽样与全部元数据）、`raw/yuque-dl/`（yuque-dl 原文）、本仓库 `docs/ATTACHMENTS.md`。