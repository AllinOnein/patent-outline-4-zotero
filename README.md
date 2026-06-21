# Patent Outline Generator for Zotero

> 基于 MinerU 解析结果与 AI 目录生成技术，为专利 PDF 自动构建可跳转目录（PDF Bookmark），并直接集成到 Zotero 阅读器中。

---

## 项目简介

专利文档通常篇幅较长（50–300+ 页），且缺乏结构化目录。

阅读时经常需要：

* 查找实施例（Examples）
* 查找特定 siRNA 序列
* 查找实验数据表格
* 查找权利要求（Claims）
* 查找背景技术与发明内容

传统 PDF 往往不包含可导航目录，即使使用 Zotero 管理专利，也需要频繁滚动页面进行查找。

Patent Outline Generator 的目标是：

> 自动从 MinerU 解析结果中生成结构化目录，并写入 PDF Bookmark，使专利在 Zotero 中具备可跳转导航能力。

---

## 功能特性

### 自动发现 MinerU 解析结果

插件自动识别：

```text
父条目
 ├─ PDF附件
 └─ MinerU ZIP附件
```

无需手动指定文件。

---

### AI 目录生成

支持兼容 OpenAI API 格式的大模型：

* GPT
* Claude（兼容接口）
* DeepSeek
* Qwen
* Gemini（兼容网关）

根据：

```text
content_list.json
full.md
```

自动识别：

* 技术领域
* 背景技术
* 发明内容
* 实施例
* 实验部分
* 权利要求
* 其他重要导航节点

---

### 目录预览

生成后可预览目录结构：

```text
实施例

 ├─ APP-siRNA体外实验

 ├─ DPP4-siRNA体外实验

 └─ INHBE-siRNA体外实验
```

支持：

* Confirm
* Cancel
* Export JSON

---

### PDF Bookmark 写入

自动将目录写入 PDF：

```text
PDF
 └─ Outline
     ├─ 实施例
     ├─ APP-siRNA体外实验
     └─ DPP4-siRNA体外实验
```

支持：

* Level 1
* Level 2
* Level 3
* Level 4

---

### Zotero 原生导航

写入后可直接在 Zotero PDF Reader 中显示：

```text
Outline
 ├─ 实施例
 ├─ APP-siRNA体外实验
 └─ DPP4-siRNA体外实验
```

点击目录即可跳转。

无需额外阅读器。

---

### 安全备份

写入前自动备份：

```text
patent.pdf
↓
patent.pdf.bak
```

写入失败时可恢复原文件。

---

## 工作流程

```text
Zotero Parent Item
         │
         ▼
发现 PDF + MinerU ZIP
         │
         ▼
读取 content_list.json
读取 full.md
         │
         ▼
AI 生成目录
         │
         ▼
目录预览
         │
         ▼
用户确认
         │
         ▼
写入 PDF Bookmark
         │
         ▼
Zotero 阅读器显示目录
```

---

## 支持的 MinerU 数据

目前支持：

```text
content_list.json
full.md
manifest.json
```

推荐：

```text
content_list.json
+
full.md
```

作为主要输入。

---

## 设置项

### API Settings

| 项目              | 说明                       |
| --------------- | ------------------------ |
| Base URL        | OpenAI Compatible API 地址 |
| API Key         | API 密钥                   |
| Model           | 使用模型名称                   |
| Test Connection | 测试连接                     |

---

### Outline Settings

| 项目                     | 说明       |
| ---------------------- | -------- |
| Preview before writing | 写入前预览目录  |
| Auto backup PDF        | 自动备份 PDF |
| Save debug files       | 保存调试文件   |

---

### Generation Mode

#### Smart（默认）

AI + 结构化信息混合模式。

推荐。

---

#### AI Enhanced

使用更多上下文增强目录质量。

适合复杂专利。

---

#### AI Only

完全由 AI 生成目录。

实验功能。

---

## 支持的文档类型

理论支持：

* 专利（Patent）
* PCT
* WO
* US Patent
* CN Patent
* EP Patent

当前主要针对：

```text
化学专利
RNAi专利
siRNA专利
ASO专利
寡核苷酸专利
```

进行优化测试。

---

## 已验证环境

### Zotero

* Zotero 9

---

### MinerU

* MinerU v2

---

### PDF

已验证：

* PDF 1.4
* PDF 1.5
* PDF 1.6
* PDF 1.7

---

## 技术架构

```text
Zotero Plugin
        │
        ▼
MinerU ZIP Reader
        │
        ▼
Outline Generator
        │
        ▼
AI Provider
        │
        ▼
Outline Preview
        │
        ▼
PDF Bookmark Writer
        │
        ▼
pdf-lib
        │
        ▼
PDF Outline
```

---

## 项目状态

### 当前版本

```text
MVP
```

已实现：

* MinerU ZIP读取
* AI目录生成
* 目录预览
* PDF Bookmark写入
* Zotero目录导航

---

## 后续规划

### V1.1

* 批量处理多个专利
* 目录质量评估工具
* Prompt 模板优化

### V1.2

* Patent Heading Pattern Library
* 本地缓存
* 增量更新

### V2.0

* 专利知识图谱
* 专利摘要生成
* 关键序列导航
* 图表导航

---

## 致谢

本项目基于以下开源项目：

* [Zotero Plugin Template](https://github.com/windingwind/zotero-plugin-template?utm_source=chatgpt.com)
* [LLM-for-zotero](https://github.com/yilewang/llm-for-zotero)
* [MinerU](https://github.com/opendatalab/MinerU?utm_source=chatgpt.com)
* [pdf-lib](https://github.com/Hopding/pdf-lib?utm_source=chatgpt.com)

---

## License

MIT License
