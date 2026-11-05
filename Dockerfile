# 使用內建完整圖形與字型依賴庫的專用基底
FROM ghcr.io/puppeteer/puppeteer:20.9.0

# 切換到 root 權限
USER root

# 設定專案工作目錄
WORKDIR /app

# 💡 物理通關：注意點點之間要有空格！
# 代表把本地目前目錄下的所有東西（包含 node_modules），複製到容器的 /app 目錄下
COPY . .

# 處理客製化字型
RUN mkdir -p /usr/share/fonts/truetype/custom \
    && cp -r ./fonts/* /usr/share/fonts/truetype/custom/ 2>/dev/null || true \
    && fc-cache -f -v

# 啟動機器人命令
CMD ["node", "src/main.js"]
