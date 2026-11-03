# raw/ —— 抓取原料与可追溯记录

本目录保存从语雀**公开面**抓取到的原始数据，构建时不修改其内容（`scripts/build-content.mjs` 只读取）。

## 目录

| 路径 | 说明 |
| --- | --- |
| `manifest.json` | 由 `scripts/fetch-yuque.mjs` 生成：知识库信息、17 篇文档元数据、128 个附件的名称/大小/原始链接、附件可访问性抽样结果 |
| `attachments.csv` | 构建时从 manifest 导出的附件清单（Excel 可读） |
| `yuque-dl/index.md` | yuque-dl 生成的分区索引（英语一部分） |
| `yuque-dl/阅读英语一10-25_xJKLhDDxGPFt_Hpg/*.md` | yuque-dl 下载的 16 篇年份原文（UTF-8，含原始附件链接与更新时间） |

## 抓取方式

```bash
# 1) 正文 Markdown（需先安装 yuque-dl）
npx yuque-dl "https://www.yuque.com/nanxiao_fighters/afkiny" -d download --toc

# 2) 元数据 + 附件可访问性抽查（本项目脚本，仅匿名公开接口）
node scripts/fetch-yuque.mjs
```

- 抓取时间：2026-11-03（Asia/Shanghai）。
- 只保留「阅读英语一10-25」分区；英二目录未复制进本仓库。
- 全程未登录、未使用 Cookie / Token；附件正文因语雀登录限制**未被下载**。
- `yuque-dl` 会为下载失败的附件创建空目录，已在整理时移除；失败记录见 `manifest.json → attachments.access`。

## 为什么附件正文不在仓库里

语雀对 `/attachments/**` 的匿名请求统一返回 `302 → /login`（抽样验证见 manifest）。
项目选择尊重访问控制，不绕过登录；附件清单与原始链接完整保留，登录语雀后可自行打开。