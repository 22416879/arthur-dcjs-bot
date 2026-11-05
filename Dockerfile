# 使用官方 Node.js 20 輕量版作為基底
FROM node:20-slim

# 安裝 Canvas 動態生成卡牌所需的 Linux 底層圖形庫依賴
RUN apt-get update && apt-get install -y \
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg-dev \
    fonts-noto-cjk \
    fontconfig \
    && rm -rf /var/lib/apt/lists/*

# 設定專案工作目錄
WORKDIR /app

# 複製 package.json 並安裝 Node 套件
COPY package*.json ./
RUN npm install --omit=dev

# 複製專案所有代碼
COPY . .

# 💡 處理客製化字型（華康超圓體）
# 這裡修正了續行符號，確保指令能正確在 Linux 容器內執行
RUN mkdir -p /usr/share/fonts/truetype/custom \
    && cp -r ./fonts/* /usr/share/fonts/truetype/custom/ 2>/dev/null || true \
    && fc-cache -f -v

# 啟動機器人命令
# 從您的 VS Code 檔案樹來看，主程式是 src/main.js，所以這裡更新為正確的路徑
CMD ["node", "src/main.js"]
