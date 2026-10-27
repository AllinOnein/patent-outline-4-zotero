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

## 兼容性

| 插件版本 | Zotero 版本 |
| ------- | ---------- |
| 1.1.7   | Zotero 8 / 9 / 10（在 Zotero 10.0.6 上验证） |
| 1.0.0   | Zotero 7 / 8 / 9 |

插件清单声明 `strict_min_version = 8.0`、`strict_max_version = 10.0.*`。
Zotero 10 会拒绝加载未声明兼容 10.x 的插件，因此 1.0.0 无法在 Zotero 10 中启用。

### 1.1.x 的升级内容

* **Zotero 10 兼容**：`strict_max_version` 更新为 `10.0.*`，清单指向真实的图标文件。
* **菜单改用官方 API**：`ztoolkit.Menu`（已弃用，并在 zotero-plugin-toolkit 6 中移除）替换为
  `Zotero.MenuManager.registerMenu()`，菜单项只对普通条目显示。
* **脚本加载**：`bootstrap.js` 改用 `loadSubScriptWithOptions()` 并开启 `ignoreCache` /
  `allowUnsafeURL`，与 Zotero 自身加载插件的方式一致（Zotero 10 拒绝加载 jar: 脚本，
  且升级后不会继续运行缓存的旧脚本）。
* **本地化**：菜单标签改为 Fluent `.label` 属性，并把 `addon.ftl` 注入主窗口；
  兼容 Zotero 10 对插件 FTL 的合并式注册。
* **阅读器同步**：写入前关闭该 PDF 已打开的阅读器标签，写入后按原页码重新打开，
  既避免 Windows 下文件被占用导致写入失败，也保证新目录立即可见。
* **依赖升级**：`zotero-plugin-toolkit` 6.x、`zotero-types` 4.1.x，构建目标 Firefox 140。
* **图标重绘**：菜单图标为 16px PNG（浅色/深色两版，线框文档 + 蓝色书签标签），
  应用图标为同款透明背景 48/96 PNG；设置面板与进度窗沿用应用图标。
  图标源文件在 `tools/icon-src/`，用 `node tools/render-icons.mjs` 重新生成。
* **菜单注册修复**：插件热更新时 Zotero 会保留上一实例的菜单注册，同 ID 再注册会被拒绝，
  导致菜单一直沿用旧图标。现在注册前会清理遗留注册。
* **图标内联**：菜单/设置面板/进度窗的图标以 data URL 内联，不再依赖 `chrome://` 地址。
  菜单图标改为在菜单项上绘制背景图（`MenuManager` 的 `icon` 走 `list-style-image`，
  在部分 Zotero/Windows 构建上不显示）。
* **大文档支持**：提示词按预算抽样（标题优先 + 每页首行），控制成本并兼容上下文较小的模型；
  输出被 `max_tokens` 截断时自动放大预算重试一次；
  推理模型可关闭思考模式，错误提示会附带 API 原始信息。

---

## 已验证环境

### Zotero

* Zotero 10.0.6（自动化启动测试：插件加载、菜单注册、FTL 解析、设置面板均通过）
* Zotero 9
* Zotero 8（API 兼容，未单独实测）

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
1.1.7
```

已实现：

* MinerU ZIP读取
* AI目录生成
* 目录预览
* PDF Bookmark写入
* Zotero目录导航
* Zotero 10 兼容（MenuManager 菜单、Fluent 本地化、阅读器自动刷新）

---

## 后续规划

### V1.2

* 批量处理多个专利
* 目录质量评估工具
* Prompt 模板优化

### V1.3

* Patent Heading Pattern Library
* 本地缓存
* 增量更新

### V2.0

* 专利知识图谱
* 专利摘要生成
* 关键序列导航
* 图表导航

---

## 故障排查

### 生成大纲时报“AI 请求失败”

提示框现在会附上 API 的原始错误，常见几类：

- `AI API error (400): ...` — 请求被拒绝：模型名错误、超出该模型的上下文上限或触发限流。
  插件会把超长文档精简到约 6 万字符（`outline.maxInputChars`）；若模型上下文较小，可再调低该值。
- `401` / `403` — 密钥无效或无权限。
- `模型只返回了思考内容` — 推理模型把输出预算花在思考上；在设置中勾选“关闭模型思考”，
  或改用非推理模型。
- `Request timed out` — 超过 5 分钟。

### 大纲条目偏少

文档过长时只发送“标题类条目 + 每页首行”。可在 about:config 调大
`extensions.zotero.patentplus.outline.maxInputChars`（默认 60000）后重试。

### 大纲在末尾被截断

插件会自动放大输出预算重试一次。仍不够时，可调大
`extensions.zotero.patentplus.ai.maxTokens`（默认 8192，上限取决于模型）。

---

## 致谢

本项目由AI辅助完成：
deepseek
ChatGPT
opencode

本项目基于以下开源项目：

* [Zotero Plugin Template](https://github.com/windingwind/zotero-plugin-template?utm_source=chatgpt.com)
* [llm-for-zotero](https://github.com/yilewang/llm-for-zotero)
* [MinerU](https://github.com/opendatalab/MinerU?utm_source=chatgpt.com)
* [pdf-lib](https://github.com/Hopding/pdf-lib?utm_source=chatgpt.com)

---

## License

MIT License
