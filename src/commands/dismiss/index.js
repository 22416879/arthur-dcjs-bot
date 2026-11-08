import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { Card } from '../../database/Card.js'; 
import { inventoryDB } from '../../database/inventoryDB.js'; 

const rarityMap = { 1: 'C', 2: 'R', 3: 'SR', 4: 'SSR', 5: 'SSS' };
const ticketMap = { 'C': 'c_ticket', 'R': 'r_ticket', 'SR': 'sr_ticket', 'SSR': 'ssr_ticket', 'SSS': 'sss_ticket' };
const ticketNames = {
    c_ticket: '🎟️ C 級招募券',
    r_ticket: '🎟️ R 級招募券',
    sr_ticket: '🎟️ SR 級招募券',
    ssr_ticket: '🎟️ SSR 級招募券',
    sss_ticket: '🎟️ SSS 級招募券'
};

export const command = new SlashCommandBuilder()
    .setName('dismiss')
    .setDescription('解雇單張或多張卡牌並獲得對應招募券')
    .addStringOption(option => 
        option.setName('codes')
            .setDescription('請輸入卡牌代碼，多張請用空格或逗號隔開 (例如: abcde fghij)')
            .setRequired(true)
    );

export const action = async (interaction) => {
    await interaction.deferReply();

    try {
        const userId = interaction.user.id;
        const inputCodes = interaction.options.getString('codes');
        const memberName = interaction.member ? interaction.member.displayName : interaction.user.username;

        // 1. 💡 智慧解析輸入：將空格、中文逗號「，」、英文逗號「,」都切開，並過濾掉空欄位與轉小寫
        const codeList = inputCodes
            .replace(/，/g, ',') // 把中文逗號轉英文逗號
            .replace(/\s+/g, ',') // 把連續空格轉英文逗號
            .split(',')
            .map(code => code.trim().toLowerCase())
            .filter(code => code.length > 0);

        if (codeList.length === 0) {
            return await interaction.editReply('❌ 請輸入有效的卡牌代碼！');
        }

        // 2. 💡 批量撈取屬於該玩家、且符合這些代碼的所有卡片
        const targetCards = await Card.find({
            code: { $in: codeList },
            $or: [
                { ownerId: userId },
                { ownerid: userId },
                { ownerId: String(userId) },
                { ownerid: String(userId) }
            ]
        });

        // 如果連一張符合的都找不到
        if (!targetCards || targetCards.length === 0) {
            return await interaction.editReply('❌ 找不到你輸入的任何卡牌，請確認代碼是否正確或是否為你所有！');
        }

        // 3. 💡 計算解雇這些卡牌，總共可以獲得多少張各級招募券
        const rewardSummary = { c_ticket: 0, r_ticket: 0, sr_ticket: 0, ssr_ticket: 0, sss_ticket: 0 };
        const dismissedCardDetails = []; // 用於在 Embed 上列出被解雇的卡片詳情
        const targetIdsToDelete = [];    // 收集準備刪除的 MongoDB _id

        targetCards.forEach(card => {
            const rarityString = rarityMap[card.rarity] || String(card.rarity).toUpperCase();
            const ticketKey = ticketMap[rarityString];

            if (ticketKey) {
                rewardSummary[ticketKey] += 1;
                targetIdsToDelete.push(card._id);
                dismissedCardDetails.push(`\`[${card.code}]\` **${card.name || card.characterName || '未知角色'}** [${rarityString}]`);
            }
        });

        // 4. 💡 執行資料庫批量刪除
        await Card.deleteMany({ _id: { $in: targetIdsToDelete } });

        // 5. 💡 執行資料庫批量發放招募券
        Object.keys(rewardSummary).forEach(ticketKey => {
            const amount = rewardSummary[ticketKey];
            if (amount > 0) {
                inventoryDB.addTicket(userId, ticketKey, amount);
            }
        });

        // 6. 建立精美的批量解雇通知卡片 (Embed)
        const dismissEmbed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle(`成功解雇了 ${targetIdsToDelete.length} 張卡牌`)
            .setDescription(`**${memberName}** 成功將所有卡牌解雇。`)
            .setTimestamp();

        // 格式化顯示獲得的獎勵總數（只列出數量大於 0 的）
        let rewardText = '';
        Object.keys(rewardSummary).forEach(key => {
            if (rewardSummary[key] > 0) {
                rewardText += `\`+\` **${rewardSummary[key]}** 張 ${ticketNames[key]}\n`;
            }
        });

        // 列出解雇了哪些卡
        // 如果解雇數量太多，限制顯示前 10 張，避免超過 Discord 欄位字數限制
        const maxDisplay = 10;
        let cardListText = dismissedCardDetails.slice(0, maxDisplay).join('\n');
        if (dismissedCardDetails.length > maxDisplay) {
            cardListText += `\n*...以及其他 ${dismissedCardDetails.length - maxDisplay} 張卡牌*`;
        }

        dismissEmbed.addFields(
            { name: '👤 被解雇的卡牌清單', value: cardListText, inline: false },
            { name: '🎫 獲得補償報酬總計', value: rewardText, inline: false }
        );

        // 如果玩家輸入了 5 個代碼，但實際只找到 3 張，給予溫馨提示
        if (targetIdsToDelete.length < codeList.length) {
            dismissEmbed.setFooter({ text: `提示：有 ${codeList.length - targetIdsToDelete.length} 個代碼未找到或不屬於你。` });
        } else {
            dismissEmbed.setFooter({ text: '所有指定道具已成功放入 /inventory 背包' });
        }

        await interaction.editReply({ embeds: [dismissEmbed] });

    } catch (error) {
        console.error("批量解雇卡牌失敗:", error);
        await interaction.editReply("❌ 執行批量解雇卡牌時發生系統錯誤。");
    }
};
