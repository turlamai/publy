# 生产服务端安装

[English](README.md)

服务端使用独立的 `server-v<版本>` GitHub Release，不混用 Obsidian 插件或 CLI 的版本标签。Linux x64 包包含编译后的服务端、core/shared、主题字体、按锁文件安装的生产依赖、Permit 核验模块与部署资料。生产服务器无需 npm/pnpm，也不直接运行开发源码。Node 和 Racket 运行时独立安装。

支持 Ubuntu 24.04 x64（Python 3.12）、systemd，以及安装在 `/opt/nodejs/node-v24.14.0-linux-x64` 的官方 Node v24.14.0；解包前验证供应商 SHA-256。Commerce/Permit 使用单独的固定版本 Racket 安装，按标准包管理器安装复制的发布包，不借用其他应用的包作用域。将运行时来源、校验和、全部已装依赖来源和发布记录保存在服务器受限目录，不进 Git。

1. 从 GitHub Releases 下载服务端包、`SHA256SUMS`、`release.json`，执行 `sha256sum -c SHA256SUMS`。
2. 检查已校验包内的安装脚本，再运行 `sudo bash deploy/install-server.sh 发布包 预期SHA256`。只装入 `/opt/publy/server/releases/<版本>`，由 root 管理且普通账户不可写，不自动切换或重启。
3. 保留独立 `publy` 账户、`/etc/publy/server.json`、现有加密主密钥和 `/var/lib/publy` 数据。启动前固定 `publicIp` 并配置 `secretKey`；加固单元不能修改 `/etc`。真实收费入口继续关闭。核验脚本指向安装版本的 `racket/publy-hosted-admission-cli.rkt`，Racket 指向审核过的 Commerce 运行时，不得指向 `/root/Codes`。
4. 切换时停止 `publy`，备份配置和静止状态的完整数据目录，记录旧代码和服务单元。确认待处理、执行中及结果未知任务已经核对；恢复必须先在隔离目录演练，不能只看备份文件存在。
5. 原子替换 `/opt/publy/server/current`，安装包内的持久 `publy.service`，执行 `systemd-analyze verify`、`systemctl daemon-reload` 并启动。检查本机 `/health`、文件权限、重启恢复和固定 HTTPS 反向代理。内部端口不直接暴露，不把快速隧道用作生产地址。
6. 验证失败先停止服务，核对外部副作用后恢复旧程序、单元和兼容的已验证数据快照，恢复任务先隔离再重新投递。切换链接不能撤销数据库迁移，也不能撤销已投递的草稿。回滚演练完成前保留旧版本。

密钥、原始支付数据、用户资料和真实部署清单不得进入发布包或 Git。包验收使用模拟配置、禁止外部请求、验证依赖链接不越出归档并检查 HTTP 健康；不代表微信真实投递、商户准入、即刻收直连已验收，也不允许据此开启收费。

迁移旧 `DynamicUser` 服务时，运行中的动态账户不等于持久账户。停止旧服务并备份静止数据后，建立固定的非特权 `publy` 系统账户，迁移旧私有状态目录并修正所有权，再切换新版单元；状态目录必须为 0700。

可选即刻收直连模式参见[运维说明](../docs/nowpay-direct.zh-CN.md)。Publy 只读取受保护的本地套接字和公开验签信任，支付与 Permit 私钥归独立签发服务保管；安装成功不代表可以公开收费。
