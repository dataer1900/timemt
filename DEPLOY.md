# Cloudflare Pages 部署指南

## 前置条件

- [x] GitHub 账号
- [x] Cloudflare 账号（免费注册：https://dash.cloudflare.com/sign-up）
- [x] 项目代码已推送到 GitHub 仓库

## 部署步骤

### 1. 注册 Cloudflare 账号

打开 https://dash.cloudflare.com/sign-up，用邮箱注册一个免费账号。

### 2. 创建 Pages 项目

1. 登录后，左侧菜单找到 **Workers & Pages**
2. 点击 **Create**（创建）
3. 选择 **Pages** 标签页
4. 点击 **Connect to Git**（连接 Git 仓库）

### 3. 关联 GitHub 仓库

1. 系统跳转到 GitHub 授权页面，授权 Cloudflare 访问你的仓库
2. 选择目标仓库（如 `dataer1900/timemt`）
3. 点击 **Begin setup**（开始设置）

### 4. 配置构建设置

| 设置项 | 填写内容 |
|---|---|
| Framework preset | `None`（无） |
| Build command | 留空 |
| Build output directory | `/` |

5. 点击 **Save and Deploy**（保存并部署）

### 5. 部署完成

等待 1-2 分钟，部署成功后会获得一个访问地址：

```
https://<项目名>.<随机字符>.workers.dev
```

### 6. 自动部署

配置完成后，之后每次推送到 GitHub `main` 分支，Cloudflare Pages 会自动重新部署，无需手动操作。

## 项目文件结构

GitHub 仓库只需以下 3 个文件（由 `.gitignore` 控制）：

```
├── index.html    # 页面结构
├── styles.css    # 样式
├── app.js        # 应用逻辑
└── sw.js         # Service Worker（离线缓存）
```

其他文件（`node_modules/`、`android/`、`package.json` 等）不需要推送到仓库。

## 注意事项

- **数据存储**：数据存在浏览器 localStorage，不会上传到服务器，各设备数据独立
- **离线使用**：首次访问后，Service Worker 会缓存文件，断网也能使用
- **导出备份**：点击导出按钮，可通过 iPhone 分享面板保存到文件 App / iCloud 等
