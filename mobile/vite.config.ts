import { defineConfig } from "vite";
import uni from "@dcloudio/vite-plugin-uni";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [uni()],
  server: {
    port: 5173,
    // host: true —— 手机连局域网看效果用（但局域网 IP 不是安全上下文，麦克风要等上线后测）
    host: true,
    proxy: {
      // 前端只认 /api，跨域与端口切换都在这一行里解决：本地进 8091，线上进 nginx 同源
      "/api": {
        target: "http://127.0.0.1:8091",
        changeOrigin: true,
      },
      // 听音题音频（/audio/<point.key>.mp3，后端的 express.static）
      // 不加这两条的话，前端请求 /audio/xxx.mp3 会打到 5173 而 404 —— 契约 §4.10
      "/audio": {
        target: "http://127.0.0.1:8091",
        changeOrigin: true,
      },
      // 用户上传（跟读录音、头像），后端 /uploads 静态目录
      "/uploads": {
        target: "http://127.0.0.1:8091",
        changeOrigin: true,
      },
    },
  },
});
