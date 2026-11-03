# 主题预览样例

这是一篇用于展示 Publy 主题排版效果的样例文章：标题层级、正文、强调、代码、表格与引用，一次看全。

## 排版要素

工程师写作离不开三类内容：**结论先行**的论断、*克制的强调*、以及 `const answer = 42` 这样的行内代码。好的主题应当让三者各有其位，互不喧宾夺主。

### 代码块

```ts
// 主题应当优雅地呈现代码高亮
export function publish(markdown: string): Promise<string> {
  const html = render(markdown, { theme: "claude" });
  return server.post("/v1/publish", { html });
}
```

### 表格

| 要素 | 弱主题的做法 | 好主题的做法 |
|------|------------|------------|
| 强调 | 一律加粗 | 语义分层 |
| 代码 | 等宽即可 | 高亮 + 背景呼应 |
| 链接 | 蓝色下划线 | 转文末脚注 |

> 引用块用来承接过渡与旁注。引用的样式透露一个主题的性格：克制的主题只用一条竖线，热情的主题会铺满底色。

## 链接与脚注

参考资料见 [微信官方文档](https://developers.weixin.qq.com/) 与 [Publy 设计文档](https://github.com/turlamai/publy)。链接会被转换为文末脚注，正文保持干净——这是对移动端读者最基本的尊重。
