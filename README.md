# pair-wise-yy-63 跨产品设计令牌治理与主题发布平台

维护基础令牌、语义令牌和组件别名，支持品牌主题、明暗模式与平台变体继承覆盖。包含令牌树、Monaco JSON 编辑、依赖图、循环引用与对比度校验、批量替换、变更评审、版本差异和发布锁定。

变更评审带版本基线三方合并：每条提案记录发起时的发布版本与作用主题，接受时只写该主题；当前值已被其他提案或草稿改过时保留双方修改、列出冲突令牌并转人工裁决，发布前按主题汇总已接受提案生成只读快照。

## 技术栈

Vue 3、TDesign、Pinia、Vue Router、TanStack Query、Axios、Monaco Editor、Vite、TypeScript。

## 运行

```bash
npm install
npm run dev
```

访问 `http://localhost:62063`。草稿、变更评审和当前主题保存在 `localStorage`。

```bash
npm run build
```
