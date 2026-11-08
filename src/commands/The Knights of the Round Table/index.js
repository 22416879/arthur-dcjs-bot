import { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    AttachmentBuilder 
} from 'discord.js';
import { createCanvas, loadImage } from 'canvas';
import { Card } from '../../database/Card.js';
import mongoose from 'mongoose';

// 智慧稀有度轉文字對照
const rarityMap = { 1: 'C', 2: 'R', 3: 'SR', 4: 'SSR', 5: 'SSS', 6: 'UR', 'UR': 'UR' };

export const command = new SlashCommandBuilder()
    .setName('knights_album')
    .setDescription('圓桌騎士團名冊管理：展示、儲存或更新你的 12 席騎士團相簿')
    .addStringOption(option => 
        option.setName('codes')
            .setDescription('【更新時填寫】輸入 12 張卡牌代碼，用空格或逗號隔開；不填則直接調用上次儲存的相簿')
            .setRequired(false) // 💡 關鍵修正：改為非必填，實現隨叫隨看！
    );

export const action = async (interaction) => {
    await interaction.deferReply();

    try {
        const userId = interaction.user.id;
        const inputCodes = interaction.options.getString('codes');
        const memberName = interaction.member ? interaction.member.displayName : interaction.user.username;

        const testDb = mongoose.connection.db;
        const albumCollection = testDb.collection('knights_albums'); // 專屬相簿儲存集合

        let finalCodes = [];

        if (inputCodes) {
            // 🎯 模式 A：玩家有輸入新代碼 ➡️ 進行解析與儲存覆蓋
            finalCodes = inputCodes
                .replace(/，/g, ',')
                .replace(/\s+/g, ',')
                .split(',')
                .map(code => code.trim().toLowerCase())
                .filter(code => code.length > 0)
                .slice(0, 12);

            if (finalCodes.length === 0) {
                return await interaction.editReply('❌ 請輸入有效的卡牌代碼進行展示！');
            }

            // 將這筆最新的 12 騎士資料永久保存或更新至該玩家的紀錄中
            await albumCollection.updateOne(
                { userId: userId },
                { $set: { userId: userId, codes: finalCodes, updatedAt: new Date() } },
                { upsert: true }
            );
        } else {
            // 🎯 模式 B：玩家沒有輸入參數 ➡️ 隨叫隨看，直接從資料庫撈取上一次存的紀錄
            const savedAlbum = await albumCollection.findOne({ userId: userId });
            
            if (!savedAlbum || !savedAlbum.codes || savedAlbum.codes.length === 0) {
                return await interaction.editReply('😢 您尚未設定過任何圓桌騎士相簿喔！\n請輸入 `/knights_album codes: 您的卡牌代碼` 來首次儲存並展示相簿吧！');
            }
            
            finalCodes = savedAlbum.codes;
        }

        // 3. 穿透底層隔離查詢，撈取屬於該玩家、且符合這些代碼的所有背包實體卡片
        const userCards = await Card.find({
            code: { $in: finalCodes },
            $or: [
                { ownerId: userId }, { ownerid: userId }, { ownerId: String(userId) }, { ownerid: String(userId) }
            ]
        }).lean();

        // 4. 依照 finalCodes 的順序，重新將撈出來的卡片進行「精準排序」
        const sortedDisplayCards = [];
        finalCodes.forEach(code => {
            const found = userCards.find(c => String(c.code).toLowerCase() === code);
            if (found) sortedDisplayCards.push(found);
        });

        // 💡 將準備好的資料完全推送給後半段的分頁繪圖引擎
        renderKnightsAlbum(interaction, sortedDisplayCards, memberName, finalCodes);

    } catch (error) {
        console.error("圓桌騎士相簿調用或儲存失敗:", error);
        await interaction.editReply("❌ 讀取或儲存您的圓桌相簿時發生系統錯誤。");
    }
};
// 💡 第 2 段：100% 獨立閉合的動態翻頁 Canvas 卡面 ＋ 1~12 席完全靜態全開列表渲染引擎
// 💡 最終終極修復版第 2 段：徹底修正 textColors 變數未定義錯誤，完美實現圖面 3 連翻頁 ＋ 1~12席靜態全開
async function renderKnightsAlbum(interaction, sortedDisplayCards, memberName, finalCodes) {
    try {
        const TOTAL_ITEMS = 12;
        const ITEMS_PER_PAGE = 3;
        const totalPages = 4;
        let currentPage = 1;

        // 1. 📝 智慧「全靜態」文字清單生成器：【不論怎麼翻頁，這裡永遠 100% 完整列出全 1~12 席】
        let staticLeaderboardText = '';
        for (let j = 0; j < TOTAL_ITEMS; j++) {
            const currentSlotCode = finalCodes[j];
            
            if (currentSlotCode) {
                const c = sortedDisplayCards.find(card => String(card.code).toLowerCase() === currentSlotCode);
                
                if (c) {
                    let rCode = String(c.rarity || '1').trim();
                    if (rarityMap[rCode]) rCode = rarityMap[rCode];
                    
                    let fN = '00000'; const rId = c.cardid || c.cardId || '';
                    if (String(rId).includes('_')) fN = String(rId).split('_').pop();
                    else if (String(rId).includes('/')) fN = String(rId).split('/').pop();
                    else fN = String(rId).replace('#', '');
                    const nM = String(fN).match(/\d+/);
                    const fNum = nM ? String(nM).padStart(5, '0') : '00000';

                    staticLeaderboardText += `\`[${c.code}]\` \`#${fNum}\` **${c.name}** \`[${rCode}]\` - *${c.series || "經典動漫"}*\n`;
                } else {
                    staticLeaderboardText += ` \`[${currentSlotCode}]\` ⚠️ *[背包中已無此卡，請重新儲存]*\n`;
                }
            } else {
                staticLeaderboardText += ` *【 席 位 空 缺 】*\n`;
            }
        }

        // 2. 🎨 智慧動態繪圖包生成函式：【只繪製當前頁面的 3 張卡牌圖面】
        const drawPageCanvas = async (page) => {
            const canvas = createCanvas(1250, 600);
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#111214'; 
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            const cardWidth = 380; const cardHeight = 560; const gap = 30;
            const borderRadius = 16; const topPadding = 56; const imgHeight = 459;
            const FONT_STYLE = '"Source Han Serif TW", serif';
            const NUMBER_FONT_STYLE = '"MantouSans-Regular", "MantouSans_Regular", sans-serif';

            const startIndex = (page - 1) * ITEMS_PER_PAGE;

            for (let i = 0; i < 3; i++) {
                const targetIndex = startIndex + i;
                const startX = gap + i * (cardWidth + gap);
                const startY = 20;

                // 畫卡片暗黑底座
                ctx.fillStyle = '#1c1d21';
                ctx.beginPath(); ctx.roundRect(startX, startY, cardWidth, cardHeight, borderRadius); ctx.fill();

                // 智慧空缺排查
                const slotCode = finalCodes[targetIndex];
                const card = slotCode ? sortedDisplayCards.find(card => String(card.code).toLowerCase() === slotCode) : null;

                if (!card) {
                    ctx.save();
                    ctx.font = "italic 28px 'Source Han Serif TW', serif"; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
                    ctx.fillText(slotCode ? '【卡片已遺失】' : '【 席 位 空 缺 】', startX + cardWidth / 2, startY + cardHeight / 2);
                    ctx.restore();
                    continue; 
                }

                // 有卡，正常解析卡號
                let finalNum = '00000'; const rawCardId = card.cardid || card.cardId || '';
                if (String(rawCardId).includes('_')) finalNum = String(rawCardId).split('_').pop();
                else if (String(rawCardId).includes('/')) finalNum = String(rawCardId).split('/').pop();
                else finalNum = String(rawCardId).replace('#', '');
                const numMatch = String(finalNum).match(/\d+/);
                const displayId = numMatch ? String(numMatch).padStart(5, '0') : '00000';
                const currentNum = parseInt(displayId, 10);

                let rarityCode = String(card.rarity || '1').trim();
                if (rarityMap[rarityCode]) rarityCode = rarityMap[rarityCode];

                // 100% 複製 /drop 各等級專屬視覺顯色配置
                let currentColors = ['#ffffff', '#ffffff'];
                let currentBorderColors = ['#ffffff', '#b3b3b3'];
                let currentStrokeColor = '#111111';
                let currentGlowColor = null;

                if (rarityCode === 'C') {
                    currentColors = ['#2ecc71', '#27ae60']; currentBorderColors = ['#a3e4d7', '#a9dfbf']; currentStrokeColor = '#0e6251';
                } else if (rarityCode === 'R') {
                    currentColors = ['#00a8ff', '#00d2d3']; currentBorderColors = ['#5cd1ff', '#64f3f4']; currentStrokeColor = '#ffffff';
                } else if (rarityCode === 'SR') {
                    currentColors = ['#8e44ad', '#9b59b6']; currentBorderColors = ['#d28eff', '#dfa8ff']; currentStrokeColor = '#4b0082';
                } else if (rarityCode === 'SSR') {
                    currentColors = ['#ff9f43', '#ee5253']; currentBorderColors = ['#ffca85', '#ff9293']; currentStrokeColor = '#ffea79'; currentGlowColor = '#ff9f43';
                } else if (rarityCode === 'SSS') {
                    currentColors = ['#f1c40f', '#f39c12']; currentBorderColors = ['#ffe675', '#ffd254']; currentStrokeColor = '#ff7f50'; currentGlowColor = '#f1c40f';
                } else if (rarityCode === 'UR') {
                    currentColors = ['#ff003c', '#ff4766']; currentBorderColors = ['#ff6b8b', '#ff8a75']; currentStrokeColor = '#6e0017'; currentGlowColor = '#ff003c';
                }

                // 圓角裁切並畫入角色原圖
                ctx.save();
                ctx.beginPath(); ctx.roundRect(startX + 12, startY + topPadding, cardWidth - 24, imgHeight, 8); ctx.closePath(); ctx.clip();
                try {
                    const charImage = await loadImage(card.imagelink || card.imageLink || card.imageUrl);
                    ctx.drawImage(charImage, startX + 12, startY + topPadding, cardWidth - 24, imgHeight);
                } catch (e) {
                    ctx.fillStyle = '#2c2f33'; ctx.fillRect(startX + 12, startY + topPadding, cardWidth - 24, imgHeight);
                }
                ctx.restore();

                // 繪製底部卡號黑襯底條
                const numberText = `NO . ${displayId}`;
                ctx.save();
                ctx.font = `24px ${NUMBER_FONT_STYLE}`; ctx.textAlign = 'left';
                ctx.fillStyle = 'rgba(0, 0, 0, 0.8)'; ctx.fillText(numberText, startX + 24, startY + cardHeight - 18);
                ctx.restore();

                // 流水號顯色
                ctx.save();
                ctx.font = `24px ${NUMBER_FONT_STYLE}`; ctx.textAlign = 'left';
                const isRepeatedFiveDigits = currentNum > 0 && currentNum < 100000 && currentNum % 11111 === 0;
                if (currentNum < 10 || currentNum === 87123) {
                    ctx.strokeStyle = '#f1c40f'; ctx.lineWidth = 3; ctx.strokeText(numberText, startX + 24, startY + cardHeight - 18);
                    ctx.fillStyle = '#ee5253'; ctx.fillText(numberText, startX + 24, startY + cardHeight - 18);
                } else if (isRepeatedFiveDigits) {
                    ctx.fillStyle = '#ff9ff3'; ctx.fillText(numberText, startX + 24, startY + cardHeight - 18);
                } else if (currentNum < 100) {
                    ctx.fillStyle = '#ee5253'; ctx.fillText(numberText, startX + 24, startY + cardHeight - 18);
                } else if (currentNum < 1000) {
                    ctx.fillStyle = '#ff9f43'; ctx.fillText(numberText, startX + 24, startY + cardHeight - 18);
                } else if (currentNum < 10000) {
                    ctx.fillStyle = '#f1c40f'; ctx.fillText(numberText, startX + 24, startY + cardHeight - 18);
                } else {
                    ctx.fillStyle = '#ffffff'; ctx.fillText(numberText, startX + 24, startY + cardHeight - 18);
                }
                ctx.restore();

                // 繪製邊框
                ctx.save();
                if (currentGlowColor) { ctx.shadowColor = currentGlowColor; ctx.shadowBlur = 22; }
                const borderGradient = ctx.createLinearGradient(startX, startY, startX + cardWidth, startY + cardHeight);
                borderGradient.addColorStop(0, currentBorderColors[0]); borderGradient.addColorStop(1, currentBorderColors[1]);
                ctx.strokeStyle = borderGradient; ctx.lineWidth = 10;
                ctx.beginPath(); ctx.roundRect(startX + 5, startY + 5, cardWidth - 10, cardHeight - 10, borderRadius - 2); ctx.stroke();
                ctx.restore();

                // 頂端繪製名稱 (完美套用各稀有度專屬描邊與白色內襯)
                ctx.save();
                ctx.font = "28px 'MyLevelFont', serif"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.strokeStyle = currentStrokeColor; ctx.lineWidth = 1.5;
                ctx.strokeText(card.name.substring(0, 16), startX + cardWidth / 2, startY + 28);
                ctx.fillStyle = '#ffffff'; ctx.fillText(card.name.substring(0, 16), startX + cardWidth / 2, startY + 28);
                ctx.restore();

                // 右下角大字
                ctx.save();
                if (currentGlowColor) { ctx.shadowColor = currentGlowColor; ctx.shadowBlur = 15; } else { ctx.shadowColor = 'rgba(0, 0, 0, 0.8)'; ctx.shadowBlur = 8; }
                const txtGrad = ctx.createLinearGradient(startX, startY + 400, startX, startY + 540);
                // 🛠️ 核心修正：將原本誤寫的 textColors 改回正確宣告的 currentColors 變數！
                txtGrad.addColorStop(0, currentColors[0]); 
                txtGrad.addColorStop(1, currentColors[1]);
                
                ctx.font = `italic bold 90px ${FONT_STYLE}`; ctx.textAlign = 'right';
                ctx.strokeStyle = currentStrokeColor; ctx.lineWidth = 2.5;
ctx.strokeText(rarityCode, startX + cardWidth - 35, startY + cardHeight - 25);
ctx.fillStyle = txtGrad; ctx.fillText(rarityCode, startX + cardWidth - 35, startY + cardHeight - 25);
ctx.restore();
}
return canvas.toBuffer();
};
// 🎯 智慧組合包生成器 (雙 Embed 邊條分流發送 ＋ 動態附檔名防快取)
        // 🎯 智慧組合包生成器 (雙 Embed 邊條分流發送 ＋ 動態附檔名防快取)
        const generatePagePackage = async (page) => {
            const buffer = await drawPageCanvas(page);
            const imageNonce = Math.floor(Math.random() * 999999);
            const currentAttachmentName = `knights_album_${imageNonce}.png`; // 🛠️ 修正點：補上反單引號
            const freshAttachment = new AttachmentBuilder(buffer, { name: currentAttachmentName });

            // 區塊 A：專屬頂部大圖卡片 (邊邊用霓虹紅 #FF003C)
            const imageEmbed = new EmbedBuilder()
                .setColor('#F1C40F')
                .setTitle(`📂 領主 ${memberName} 的圓桌騎士團`) // 🛠️ 修正點：補上反單引號
                .setImage(`attachment://${currentAttachmentName}`); // 🛠️ 修正點：補上反單引號

            // 區塊 B：專屬底部文字卡片 (邊邊用黃色 #F1C40F，100% 全靜態全開鎖定)
            const listEmbed = new EmbedBuilder()
                .setColor('#F1C40F')
                .setDescription(staticLeaderboardText)
                .setFooter({ text: `當前展示：席位 [${(page - 1) * 3 + 1} ~ ${page * 3}] ｜ 騎士團席位名冊管理` }) // 🛠️ 修正點：補上反單引號
                .setTimestamp();

            const paginationRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`knights_prev_${interaction.id}`) // 🛠️ 修正點：補上反單引號
                    .setLabel('◀️ 上一頁')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(page === 1),
                new ButtonBuilder()
                    .setCustomId(`knights_next_${interaction.id}`) // 🛠️ 修正點：補上反單引號
                    .setLabel('下一頁 ▶️')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(page === totalPages)
            );

            return { embeds: [imageEmbed, listEmbed], components: [paginationRow], files: [freshAttachment] };
        };

        // 發送第 1 頁初始組合包
        const initialPackage = await generatePagePackage(currentPage);
        const resultMessage = await interaction.editReply(initialPackage);

        // 啟動專屬分頁 Button 收集器 (時效 3 分鐘)
        const pageCollector = resultMessage.createMessageComponentCollector({
            // 🛠️ 修正點：修復 endsWith 內部的字串引號與變數編排
            filter: (i) => i.customId.endsWith(`_${interaction.id}`),
            time: 3 * 60 * 1000
        });

        pageCollector.on('collect', async (pageBtnInteraction) => {
            if (pageBtnInteraction.user.id !== interaction.user.id) {
                return pageBtnInteraction.reply({ content: '❌ 這不是你的騎士團相簿喔！', ephemeral: true });
            }

            if (pageBtnInteraction.customId.startsWith('knights_prev_')) {
                currentPage--;
            } else if (pageBtnInteraction.customId.startsWith('knights_next_')) {
                currentPage++;
            }

            await pageBtnInteraction.deferUpdate();
            const newPackage = await generatePagePackage(currentPage);
            await interaction.editReply(newPackage);
        });

        pageCollector.on('end', async () => {
            try {
                const finalPackage = await generatePagePackage(currentPage);
                const disabledRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('k_prev_dis').setLabel('上一頁').setStyle(ButtonStyle.Secondary).setDisabled(true),
                    new ButtonBuilder().setCustomId('k_next_dis').setLabel('下一頁').setStyle(ButtonStyle.Secondary).setDisabled(true)
                );
                await interaction.editReply({ embeds: finalPackage.embeds, components: [disabledRow], files: finalPackage.files });
            } catch (err) {}
        });

    } catch (err) {
        console.error("圓桌相簿分頁重構失敗:", err);
        await interaction.editReply("❌ 渲染相簿分頁大圖時發生 Canvas 內部錯誤。");
    }
}
