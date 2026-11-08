import { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle,
    AttachmentBuilder
} from 'discord.js';
import { createCanvas, loadImage } from 'canvas';
import { inventoryDB } from '../../database/inventoryDB.js';
import { Card } from '../../database/Card.js';
import mongoose from 'mongoose';

// 五種招募券各自獨立兌換 1 張 UR 卡的比例
const TICKET_RATES = { sss_ticket: 5, ssr_ticket: 10, sr_ticket: 20, r_ticket: 40, c_ticket: 80 };

const ticketNames = {
    sss_ticket: '🎟️ SSS 級招募券',
    ssr_ticket: '🎟️ SSR 級招募券',
    sr_ticket: '🎟️ SR 級招募券',
    r_ticket: '🎟️ R 級招募券',
    c_ticket: '🎟️ C 級招募券'
};

// 🎯 短代碼與隨機流水號生成器
function generateShortCode() {
    const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
}

async function generateUniqueNumber(cardsCollection, cloudinaryPublicId) {
    try {
        const issuedNumbers = await cardsCollection.find({ cloudinaryPublicId: cloudinaryPublicId }).project({ cardNumber: 1 }).toArray();
        const usedSet = new Set(issuedNumbers.map(c => c.cardNumber).filter(n => n !== undefined));
        while (true) {
            const randNum = Math.floor(Math.random() * 100000) + 1;
            if (!usedSet.has(randNum)) return randNum;
        }
    } catch (err) { return Math.floor(Math.random() * 100000) + 1; }
}

export const command = new SlashCommandBuilder()
    .setName('tavern')
    .setDescription('使用指定招募券，招募限定 UR 卡牌');

export const action = async (interaction) => {
    await interaction.deferReply();

    try {
        const database = mongoose.connection.useDb('card_bot_db');
        const memberName = interaction.member ? interaction.member.displayName : interaction.user.username;

        // 1. 🎯 核心修正：從 `tavern_cards` 隨機抓取一張大圖，並加上 [0] 精準讀取物件欄位
        // 💡 請修改為：
const currentDb = mongoose.connection.client.db('card_bot_db');
const tavernCollection = currentDb.collection('tavern_cards');
const tavernBannerArray = await tavernCollection.aggregate([{ $sample: { size: 1 } }]).toArray();

        // 🛠️ 修正點：必須加上 [0].imageUrl 或是 [0].imageLink，100% 讀出你在後台設定的精美大底圖
        const bannerUrl = (tavernBannerArray && tavernBannerArray.length > 0)
            ? (tavernBannerArray[0].imageUrl || tavernBannerArray[0].imageLink || tavernBannerArray[0].imageUrl) 
            : 'https://cloudinary.com';

        // 2. 建立酒館主頁面 Embed
        const tavernEmbed = new EmbedBuilder()
            .setColor('#7D0552')
            .setTitle('🍺 卡梅洛城酒館招募處 — 限定 UR 卡牌招募')
            .setDescription(
                `歡迎來到酒館，**${memberName}**！\n` +
                `現在就點擊下方按鈕，選擇你想消耗的招募券等級來招募夥伴吧！\n\n` +
                `**【招募一張 UR 卡所需票券比例】**\n` +
                `🥇 \`5\` 張 ${ticketNames.sss_ticket}\n` +
                `🥈 \`10\` 張 ${ticketNames.ssr_ticket}\n` +
                `🥉 \`20\` 張 ${ticketNames.sr_ticket}\n` +
                `✨ \`40\` 張 ${ticketNames.r_ticket}\n` +
                `🎫 \`80\` 張 ${ticketNames.c_ticket}\n\n` +
                `*請點擊按鈕後輸入您想要招募的卡牌數量。*`
            )
            .setImage(bannerUrl) // 🔥 這裡將會百分之百完美帶出你專屬的酒館大圖！
            .setTimestamp();

        // 3. 建立 5 個選單按鈕
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`tavern_btn_c_${interaction.id}`).setLabel('C 招募').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`tavern_btn_r_${interaction.id}`).setLabel('R 招募').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`tavern_btn_sr_${interaction.id}`).setLabel('SR 招募').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`tavern_btn_ssr_${interaction.id}`).setLabel('SSR 招募').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`tavern_btn_sss_${interaction.id}`).setLabel('SSS 招募').setStyle(ButtonStyle.Danger)
        );

        const mainMessage = await interaction.editReply({ embeds: [tavernEmbed], components: [row] });

        // 4. 啟動按鈕監聽器
        const buttonCollector = mainMessage.createMessageComponentCollector({
            filter: (i) => i.customId.startsWith('tavern_btn_') && i.customId.endsWith(`_${interaction.id}`),
            time: 5 * 60 * 1000
        });

        // 呼叫核心監聽分流邏輯
        setupButtonCollector(buttonCollector, interaction, database, ticketNames);

    } catch (error) {
        console.error(error);
        await interaction.editReply('❌ 載入酒館面板時發生系統錯誤。');
    }
};

// 💡 第 2 段：完美串接按鈕翻頁 pagination 交互機制、僅繪製第一張、10張一頁乾淨不洗頻
// 💡 修正後的第 2 段：改用 followUp 獨立發送結果，完美留住原本面板的酒館主視覺大圖！
function setupButtonCollector(buttonCollector, interaction, database, ticketNames) {
    const TICKET_RATES = { sss_ticket: 5, ssr_ticket: 10, sr_ticket: 20, r_ticket: 40, c_ticket: 80 };

    buttonCollector.on('collect', async (btnInteraction) => {
        if (btnInteraction.user.id !== interaction.user.id) {
            return btnInteraction.reply({ content: '❌ 這不是你的酒館面板，請自己輸入 `/tavern` 開啟喔！', ephemeral: true });
        }

        let selectedTicketKey = '';
        if (btnInteraction.customId.includes('_c_')) selectedTicketKey = 'c_ticket';
        else if (btnInteraction.customId.includes('_r_')) selectedTicketKey = 'r_ticket';
        else if (btnInteraction.customId.includes('_sr_')) selectedTicketKey = 'sr_ticket';
        else if (btnInteraction.customId.includes('_ssr_')) selectedTicketKey = 'ssr_ticket';
        else if (btnInteraction.customId.includes('_sss_')) selectedTicketKey = 'sss_ticket';

        const labelName = ticketNames[selectedTicketKey];

        const modal = new ModalBuilder()
            .setCustomId(`tavern_modal_${selectedTicketKey}_${interaction.id}`)
            .setTitle(`使用 ${labelName.replace('🎟️ ', '')} 招募`);

        const countInput = new TextInputBuilder()
            .setCustomId('recruit_count_input')
            .setLabel(`需 ${TICKET_RATES[selectedTicketKey]} 張票券 / 每張 UR 卡`)
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('請輸入你想招募的卡牌數量（例如：1 或 20）')
            .setValue('1')
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(countInput));
        await btnInteraction.showModal(modal);

        // 宣告為外部變數以利 catch 區塊能順利捕捉防呆
        let modalSubmit;

        try {
            modalSubmit = await btnInteraction.awaitModalSubmit({
                filter: (i) => i.customId === `tavern_modal_${selectedTicketKey}_${interaction.id}`,
                time: 60000
            });

            // 💡 核心補強：這裡改用 deferReply，以便等一下用 followUp 推送獨立新訊息
            await modalSubmit.deferReply();

            const rawInput = modalSubmit.fields.getTextInputValue('recruit_count_input');
            const recruitCount = parseInt(rawInput, 10);

            if (isNaN(recruitCount) || recruitCount <= 0) {
                return await modalSubmit.editReply('❌ 請輸入正確的正整數招募數量！');
            }

            const userInv = inventoryDB.get(interaction.user.id);
            const totalCost = TICKET_RATES[selectedTicketKey] * recruitCount;

            if ((userInv[selectedTicketKey] || 0) < totalCost) {
                return await modalSubmit.editReply(
                    `❌ 你的 **${labelName}** 數量不足！\n` +
                    `本次招募 \`${recruitCount}\` 張卡牌總共需要 \`${totalCost}\` 張票券，但你目前只有 \`${userInv[selectedTicketKey] || 0}\` 張。`
                );
            }

            // 💡 請修改為：
const currentDb = mongoose.connection.client.db('card_bot_db');
const urCollection = currentDb.collection('ur_cards');
const allUrTemplates = await urCollection.find({}).toArray();


            if (!allUrTemplates || allUrTemplates.length === 0) {
                return await modalSubmit.editReply('❌ 報告管理員！後台 `ur_cards` 集合中沒有任何 UR 卡牌模板，請先同步。');
            }

            inventoryDB.addTicket(interaction.user.id, selectedTicketKey, -totalCost);

            const userCardsCollection = database.collection('cards');
            const savedCards = [];

            // 批量隨機抽取與存檔
            for (let i = 0; i < recruitCount; i++) {
                const randomIndex = Math.floor(Math.random() * allUrTemplates.length);
                const base = allUrTemplates[randomIndex];

                let uniquePlayerCode = generateShortCode();
                let isCodeDup = await userCardsCollection.findOne({ code: uniquePlayerCode });
                while (isCodeDup) {
                    uniquePlayerCode = generateShortCode();
                    isCodeDup = await userCardsCollection.findOne({ code: uniquePlayerCode });
                }

                const uniqueNum = await generateUniqueNumber(userCardsCollection, base.cloudinaryPublicId);
                const realCharacterName = base.characterName || base.name || "未知角色";
                const realSeriesText = base.series && base.series !== "未知作品" ? base.series : "酒館限定特典";

                const newCard = new Card({
                    name: realCharacterName,
                    series: realSeriesText,
                    version: base.version || "1",
                    imageUrl: base.imageUrl,
                    cardId: `${base.cloudinaryPublicId}_${uniqueNum}`,
                    rarity: 6,
                    quality: base.quality || 6,
                    ownerId: interaction.user.id,
                    code: uniquePlayerCode
                });

                await newCard.save();
                
                savedCards.push({
                    name: realCharacterName,
                    imageUrl: base.imageUrl,
                    series: realSeriesText,
                    code: uniquePlayerCode,
                    cardNumber: uniqueNum
                });
            }

            // 🎨 Canvas 繪製流程：僅繪製第一張卡牌
            const firstCard = savedCards[0];
            const currentNum = firstCard.cardNumber;

            const canvas = createCanvas(380, 600); 
            const ctx = canvas.getContext('2d');
            const startX = 0; const startY = 20; const cardWidth = 380; const cardHeight = 560;
            const borderRadius = 16; const topPadding = 56; const imgHeight = 459; 
            const FONT_STYLE = '"Source Han Serif TW", serif';
            const NUMBER_FONT_STYLE = '"MantouSans-Regular", "MantouSans_Regular", sans-serif';

            ctx.clearRect(0, 0, 380, 600);

            // 畫卡底黑底
            ctx.fillStyle = '#1c1d21';
            ctx.beginPath(); ctx.roundRect(startX, startY, cardWidth, cardHeight, borderRadius); ctx.fill();

            // 裁切角色原圖
            ctx.save();
            ctx.beginPath(); ctx.roundRect(startX + 12, startY + topPadding, cardWidth - 24, imgHeight, 8); ctx.closePath(); ctx.clip();
            try {
                const charImage = await loadImage(firstCard.imageUrl);
                ctx.drawImage(charImage, startX + 12, startY + topPadding, cardWidth - 24, imgHeight);
            } catch (e) {
                ctx.fillStyle = '#2c2f33'; ctx.fillRect(startX + 12, startY + topPadding, cardWidth - 24, imgHeight);
            }
            ctx.restore();

            // 繪製底部卡號黑襯底
            ctx.save();
            ctx.font = `24px ${NUMBER_FONT_STYLE}`; ctx.textAlign = 'left';
            const numberText = `NO . ${String(currentNum).padStart(5, '0')}`;
            ctx.fillStyle = 'rgba(0, 0, 0, 0.8)'; ctx.fillText(numberText, startX + 25, startY + cardHeight - 17);
            ctx.restore();

            // 流水號顏色判定邏輯
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

            // 繪製卡框
            ctx.save();
            ctx.shadowColor = '#ff003c'; ctx.shadowBlur = 22; 
            const borderGradient = ctx.createLinearGradient(startX, startY, startX + cardWidth, startY + cardHeight);
            borderGradient.addColorStop(0, '#ff6b8b'); borderGradient.addColorStop(1, '#ff8a75'); 
            ctx.strokeStyle = borderGradient; ctx.lineWidth = 10; 
            ctx.beginPath(); ctx.roundRect(startX + 5, startY + 5, cardWidth - 10, cardHeight - 10, borderRadius - 2); ctx.stroke();
            ctx.restore();

            // 頂端繪製角色名字
            ctx.save();
            ctx.font = "28px 'MyLevelFont', serif"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.strokeStyle = '#6e0017'; ctx.lineWidth = 1.5;
            ctx.strokeText(firstCard.name.substring(0, 16), startX + cardWidth / 2, startY + 28);
            ctx.fillStyle = '#ffffff'; ctx.fillText(firstCard.name.substring(0, 16), startX + cardWidth / 2, startY + 28);
            ctx.restore();

            // 右下角繪製漸層花體 UR 大字
            ctx.save();
            ctx.shadowColor = '#ff003c'; ctx.shadowBlur = 15;
            const textGradient = ctx.createLinearGradient(startX, startY + 400, startX, startY + 540);
            textGradient.addColorStop(0, '#ff003c'); textGradient.addColorStop(1, '#ff4766'); 
            ctx.font = `italic bold 90px ${FONT_STYLE}`; ctx.textAlign = 'right';
            ctx.strokeStyle = '#d4af37'; ctx.lineWidth = 2.5;
            ctx.strokeText('UR', startX + cardWidth - 35, startY + cardHeight - 25);
            ctx.fillStyle = textGradient; ctx.fillText('UR', startX + cardWidth - 35, startY + cardHeight - 25);
            ctx.restore();

            // 8. 📝 智慧分頁渲染引擎 (💡 改用隨機動態附檔名防快取，且每一次都攜帶 files)
                        // 💡 最終完美修正版第 4 區塊：徹底修復所有字串引號、完美連動隨機附檔名與獨立 followUp 翻頁機制
            const bufferData = canvas.toBuffer();
            
            const ITEMS_PER_PAGE = 10;
            const totalPages = Math.ceil(savedCards.length / ITEMS_PER_PAGE);
            let currentPage = 1;

            const generatePageMessage = (page) => {
                const imageNonce = Math.floor(Math.random() * 999999);
                const currentAttachmentName = `ur_recruit_${imageNonce}.png`; // 🛠️ 修正點：補上反單引號

                const resultEmbed = new EmbedBuilder()
                    .setColor('#ff003c')
                    .setTitle('🎉 恭喜成功招募限定 UR 夥伴！')
                    // 🛠️ 修正點：修復整個字串拼接，移除錯亂的反單引號與反斜線
                    .setDescription(`你消耗了 \`${totalCost}\` 張 **${labelName}**，成功招募了 \`${recruitCount}\` 位UR夥伴！\n以下為本次招募的夥伴清單，點擊下方按鈕可翻頁查看所有招募結果。`)
                    .setImage(`attachment://${currentAttachmentName}`) // 🛠️ 修正點：補上反單引號
                    .setFooter({ text: `第 ${page} / ${totalPages} 頁 ｜ 共招募 ${savedCards.length} 位夥伴` }) // 🛠️ 修正點：補上反單引號
                    .setTimestamp();

                const startIndex = (page - 1) * ITEMS_PER_PAGE;
                const pageCards = savedCards.slice(startIndex, startIndex + ITEMS_PER_PAGE);

                const cardListText = pageCards.map((card, index) => {
                    const globalIndex = startIndex + index + 1;
                    // 🛠️ 修正點：校正地獄級語法拼接，精準包裝 Discord 程式碼襯底塊
                    return `**${globalIndex}.** \`[${card.code}]\` \`#${String(card.cardNumber).padStart(5, '0')}\` **${card.name}** [UR] - *${card.series}*`;
                }).join('\n');

                resultEmbed.addFields({ name: '📋 招募卡牌清單總計', value: cardListText, inline: false });

                const paginationRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`tavern_prev_${interaction.id}`) // 🛠️ 修正點：補上反單引號
                        .setLabel('◀️ 上一頁')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(page === 1),
                    new ButtonBuilder()
                        .setCustomId(`tavern_next_${interaction.id}`) // 🛠️ 修正點：補上反單引號
                        .setLabel('下一頁 ▶️')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(page === totalPages)
                );

                const freshAttachment = new AttachmentBuilder(bufferData, { name: currentAttachmentName });
                return { embeds: [resultEmbed], components: [paginationRow], files: [freshAttachment] };
            };

            // 💡 關鍵修正點：用極簡的 editReply 清除原本的 Modal 載入圓圈狀態，絕不破壞或覆蓋上方的酒館主圖與 5 等級按鈕！
            await modalSubmit.editReply({ content: '✅ 夥伴招募完畢！已在下方為您生成獨立結算面板。', embeds: [], components: [] });
            
            // 正式利用隨機生成附檔名建立全新的 followUp 新獨立訊息
            const resultMessage = await modalSubmit.followUp(generatePageMessage(currentPage));

            // 啟動分頁專屬 Button 收集器 (時效 3 分鐘)
            const pageCollector = resultMessage.createMessageComponentCollector({
                filter: (i) => i.customId.endsWith(`_${interaction.id}`), // 🛠️ 修正點：補上引號與底線
                time: 3 * 60 * 1000
            });

            pageCollector.on('collect', async (pageBtnInteraction) => {
                if (pageBtnInteraction.user.id !== interaction.user.id) {
                    return pageBtnInteraction.reply({ content: '❌ 這不是你的招募結算卡片喔！', ephemeral: true });
                }

                if (pageBtnInteraction.customId.startsWith('tavern_prev_')) {
                    currentPage--;
                } else if (pageBtnInteraction.customId.startsWith('tavern_next_')) {
                    currentPage++;
                }

                await pageBtnInteraction.deferUpdate();
                // 💡 翻頁時直接對這則獨立的 resultMessage 進行編輯，且每次都會推送最新隨機附檔名的卡片圖，主視覺與卡圖 100% 都完美存活！
                await resultMessage.edit(generatePageMessage(currentPage));
            });

            pageCollector.on('end', async () => {
                try {
                    const currentMsgState = generatePageMessage(currentPage);
                    const disabledRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('t_prev_dis').setLabel('◀️ 上一頁').setStyle(ButtonStyle.Secondary).setDisabled(true),
                        new ButtonBuilder().setCustomId('t_next_dis').setLabel('下一頁 ▶️').setStyle(ButtonStyle.Secondary).setDisabled(true)
                    );
                    await resultMessage.edit({ embeds: currentMsgState.embeds, components: [disabledRow], files: currentMsgState.files });
                } catch (err) {}
            });

        } catch (err) {
            console.error(err);
            if (typeof modalSubmit !== 'undefined' && modalSubmit && !modalSubmit.replied && !modalSubmit.deferred) {
                await modalSubmit.editReply('❌ 招募處理時發生系統錯誤，請確認配置與卡池資料。');
            } else {
                await interaction.editReply('❌ 招募處理時發生系統錯誤，請確認配置與卡池資料。');
            }
        }
    });

    buttonCollector.on('end', async () => {
        try {
            const disabledRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('tavern_disabled').setLabel('🎯 招募已截止').setStyle(ButtonStyle.Secondary).setDisabled(true)
            );
            await interaction.editReply({ components: [disabledRow] });
        } catch (err) {}
    });
}
