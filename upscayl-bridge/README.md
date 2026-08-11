# 本机 Upscayl x2 服务

双击仓库根目录的 `启动本机Upscayl超分.bat`。看到“Upscayl x2 服务已启动”后保持窗口打开，再使用易拉宝 AI 画布。

服务只监听本机 `127.0.0.1:8766`，不能被局域网或公网直接访问。网页只能提交图片，不能传入命令或程序路径；Upscayl 程序、模型、倍率和参数全部固定在本机服务中。

默认使用：

```text
C:\Program Files\Upscayl\resources\bin\upscayl-bin.exe
C:\Program Files\Upscayl\resources\models
upscayl-standard-4x
-z 4 -s 2 -t 128 -f png
```

要求：

- Windows 已安装 Upscayl 2.15.0。
- 已安装 Node.js 20 或更高版本。
- 每位需要自动超分的同事都要在自己的电脑上启动一次本服务。
