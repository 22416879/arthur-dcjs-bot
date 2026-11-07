import { 
    SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, 
    EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle 
} from 'discord.js';
// 1. 修正路徑：對準你的 Card.js 檔案
import CardModel from '../../database/Card.js'; 

export const command = new SlashCommandBuilder()
    .setName('trade')
    .setDescription('與另一位玩家開啟卡片交易視窗（3分鐘內有效）')
    .addUserOption(option => option.setName('target').setDescription('你想交易的對象').setRequired(true));

export const action = async (interaction) => {
    // 1. 判斷並相容斜線指令(Interaction)與普通文字訊息(Message)
    const isInteraction = typeof interaction.reply === 'function' && interaction.options;
    
    // 取得發起交易的使用者A
    const userA = isInteraction ? interaction.user : interaction.author;
    
    // 取得交易目標對象使用者B
    let userB = null;
    if (isInteraction) {
        userB = interaction.options.getUser('target');
    } else {
        // 如果是快捷鍵發送的普通訊息，從標記(mentions)中抓取第一個使用者
        userB = interaction.mentions.users.first();
    }

    // 2. 驗證對象是否有效
    if (!userB || userA.id === userB.id || userB.bot) {
        const errorContent = '❌ 交易對象無效（請確保有標記提及對方，且對方不能是機器人或你自己）。';
        if (isInteraction) {
            return await interaction.reply({ content: errorContent, ephemeral: true });
        } else {
            return await interaction.channel.send({ content: errorContent });
        }
    }


    const session = {
        [userA.id]: { cards: [], locked: false },
        [userB.id]: { cards: [], locked: false }
    };

    const generateEmbed = () => {
        return new EmbedBuilder()
            .setTitle('🤝 卡片交易請求')
            .setDescription('請點擊下方 **【➕ 新增卡片】** 來放入卡片 ID（多張可用逗號隔開）。\n雙方皆點擊 **【🔒 鎖定狀態】** 後即可完成交易。')
            .setColor(0x2f3136)
            .addFields(
                { 
                    name: `👤 ${userA.username} 的交易清單 [${session[userA.id].locked ? '🟢 已鎖定' : '🔴 未鎖定'}]`, 
                    value: session[userA.id].cards.map(id => `\`${id}\``).join(', ') || '*目前無卡片*', 
                    inline: false 
                },
                { 
                    name: `👤 ${userB.username} 的交易清單 [${session[userB.id].locked ? '🟢 已鎖定' : '🔴 未鎖定'}]`, 
                    value: session[userB.id].cards.map(id => `\`${id}\``).join(', ') || '*目前無卡片*', 
                    inline: false 
                }
            )
            .setFooter({ text: '此交易工作階段將於 3 分鐘後過期。' });
    };

    const generateComponents = () => {
        return [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('trade_add').setLabel('➕ 新增卡片').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('trade_lock').setLabel(session[userA.id].locked ? '🔓 解除鎖定' : '🔒 鎖定狀態').setStyle(ButtonStyle.Secondary),

                new ButtonBuilder().setCustomId('trade_cancel').setLabel('❌ 取消交易').setStyle(ButtonStyle.Danger)
            )
        ];
    };

        const replyPayload = {
        content: `🤝 ${userA} 邀請 ${userB} 進行卡片交易！`,
        embeds: [generateEmbed()],
        components: generateComponents()
    };

    const response = isInteraction 
        ? await interaction.reply({ ...replyPayload, fetchReply: true }) 
        : await interaction.channel.send(replyPayload);


    const collector = response.createMessageComponentCollector({
        filter: i => i.user.id === userA.id || i.user.id === userB.id,
        time: 180000
    });

    collector.on('collect', async (btnInteraction) => {
        const userId = btnInteraction.user.id;

        if (btnInteraction.customId === 'trade_cancel') {
            collector.stop('cancelled');
            return await btnInteraction.update({ content: `❌ 交易已由 ${btnInteraction.user} 取消。`, embeds: [], components: [] });
        }

        if (btnInteraction.customId === 'trade_add') {
            if (session[userId].locked) {
                return await btnInteraction.reply({ content: '❌ 您已鎖定狀態，請先解除鎖定才能新增卡片！', ephemeral: true });
            }

            const modal = new ModalBuilder()
                .setCustomId(`trade_modal_${btnInteraction.id}`)
                .setTitle('放入卡片到交易清單');

            const cardInput = new TextInputBuilder()
                .setCustomId('card_ids')
                .setLabel('請輸入卡片 ID（多張請用逗號 , 隔開）')
                .setPlaceholder('例如: 23561359a, 23156987a')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(cardInput));
            await btnInteraction.showModal(modal);

            try {
                const modalSubmit = await btnInteraction.awaitModalSubmit({
                    filter: m => m.customId === `trade_modal_${btnInteraction.id}`,
                    time: 60000
                });

                await modalSubmit.deferUpdate();

      const rawInput = modalSubmit.fields.getTextInputValue('card_ids');
// 🎯 修正：切割輸入並去除空白，同時全部轉為「小寫」，確保能與資料庫的 code 完美匹配
const parsedInputs = rawInput.split(/[\s,，\[\]#]+/)
                             .filter(id => id.trim() !== '')
                             .map(id => id.trim().toLowerCase()); 

if (parsedInputs.length === 0) {
    return await modalSubmit.followUp({ content: '❌ 請輸入有效的卡片 ID。', ephemeral: true });
}

// 🎯 修正：使用正確的 code 與 ownerId 欄位名稱進行嚴格查詢
const validCards = await CardModel.find({ 
    code: { $in: parsedInputs }, 
    ownerId: userId 
});

// 提取出資料庫中驗證通過的短序號
const validIds = validCards.map(c => c.code.toString().toLowerCase());

if (validIds.length === 0) {
    return await modalSubmit.followUp({ content: '❌ 您輸入的 ID 查無資料，或您非該卡片持有者。', ephemeral: true });
}

session[userId].cards = [...new Set([...session[userId].cards, ...validIds])];
session[userA.id].locked = false;
session[userB.id].locked = false;

await response.edit({ embeds: [generateEmbed()], components: generateComponents() });


            } catch (err) {
                console.log('視窗輸入逾時或關閉');
            }
            return;
        }

        if (btnInteraction.customId === 'trade_lock') {
            session[userId].locked = !session[userId].locked;

            if (session[userA.id].locked && session[userB.id].locked) {
                collector.stop('success');
                await btnInteraction.deferUpdate();

                try {
    const cardsA = session[userA.id].cards;
    const cardsB = session[userB.id].cards;

    // 🎯 修正：批量更新時，同樣對準 code 與 ownerId 欄位來轉移擁有權
    const updateA = await CardModel.updateMany({ code: { $in: cardsA }, ownerId: userA.id }, { $set: { ownerId: userB.id } });
    const updateB = await CardModel.updateMany({ code: { $in: cardsB }, ownerId: userB.id }, { $set: { ownerId: userA.id } });

    if (updateA.matchedCount === cardsA.length && updateB.matchedCount === cardsB.length) {
       return await response.edit({
    content: `🎉 **交易成功！雙方卡片已成功對調。**`,
    embeds: [
        new EmbedBuilder()
            .setTitle('✅ 交易完成')
            .setColor(0x00ff00)
            .addFields(
                { name: `🔹 ${userA.username} 移出了`, value: cardsA.map(id => `\`${id}\``).join(', ') || '無' },
                { name: `🔹 ${userB.username} 移出了`, value: cardsB.map(id => `\`${id}\``).join(', ') || '無' }
            )
    ],
    components: []
});

    } else {
        // 異常復原機制（維持 code 與 ownerId 欄位名稱）
        await CardModel.updateMany({ code: { $in: cardsA }, ownerId: userB.id }, { $set: { ownerId: userA.id } });
        await CardModel.updateMany({ code: { $in: cardsB }, ownerId: userA.id }, { $set: { ownerId: userB.id } });
       return await response.edit({ content: '❌ 交易失敗：部分卡片狀態已在最終確認前改變。', embeds: [], components: [] });
    }
} catch (error) {
    console.error('資料庫批量更新失敗:', error);
    return await response.edit({ content: '❌ 資料庫處理發生未知錯誤。', embeds: [], components: [] });
}

            } else {
                return await btnInteraction.update({ embeds: [generateEmbed()], components: generateComponents() });
            }
        }
    });

    collector.on('end', async (collected, reason) => {
        if (reason === 'time') {
            await response.edit({ content: '⏳ 交易已逾時（3分鐘），系統自動關閉。', embeds: [], components: [] }).catch(() => {});
        }
    });
};
