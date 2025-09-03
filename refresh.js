const axios = require('axios');

// Funzione per ottenere il CSRF token
async function fetchSessionCSRFToken(roblosecurityCookie) {
    try {
        // Richiesta per logout (richiesta CSRF)
        const logoutResponse = await axios.post("https://auth.roblox.com/v2/logout", {}, {
            headers: {
                'Cookie': `.ROBLOSECURITY=${roblosecurityCookie}`
            }
        });

        // Se la risposta non dà errore, estrai il CSRF token
        return logoutResponse.headers['x-csrf-token'] || null;
    } catch (error) {
        // Se il logout fallisce, restituire null
        console.error("Errore nel recupero CSRF Token:", error);
        return null;
    }
}

// Funzione per generare un auth ticket
async function generateAuthTicket(roblosecurityCookie) {
    try {
        // Ottieni il CSRF token
        const csrfToken = await fetchSessionCSRFToken(roblosecurityCookie);
        
        if (!csrfToken) {
            throw new Error('CSRF Token non trovato');
        }

        // Richiesta per generare l'auth ticket
        const response = await axios.post("https://auth.roblox.com/v1/authentication-ticket", {}, {
            headers: {
                "x-csrf-token": csrfToken,
                "referer": "https://www.roblox.com/madebySynaptrixBitch",
                'Content-Type': 'application/json',
                'Cookie': `.ROBLOSECURITY=${roblosecurityCookie}`
            }
        });

        // Restituisci il ticket di autenticazione
        return response.headers['rbx-authentication-ticket'] || "Failed to fetch auth ticket";
    } catch (error) {
        console.error("Errore nel recupero dell'auth ticket:", error);
        return "Failed to fetch auth ticket";
    }
}

// Funzione per rinnovare il cookie
async function redeemAuthTicket(authTicket) {
    try {
        // Richiesta per rinnovare il cookie utilizzando l'auth ticket
        const response = await axios.post("https://auth.roblox.com/v1/authentication-ticket/redeem", {
            "authenticationTicket": authTicket
        }, {
            headers: {
                'RBXAuthenticationNegotiation': '1'
            }
        });

        // Estrai i cookies dalla risposta
        const cookies = response.headers['set-cookie'] || [];
        
        // Se ci sono cookies, uniscili in una stringa
        const fullCookie = cookies.join('; ');

        // Cerca il cookie rinnovato nel corpo della risposta
        const refreshedCookie = fullCookie.match(/(_\|WARNING:-DO-NOT-SHARE-THIS.--Sharing-this-will-allow-someone-to-log-in-as-you-and-to-steal-your-ROBUX-and-items.\|_[A-Za-z0-9]+)/g)?.toString();

        // Verifica se il cookie rinnovato è stato trovato
        if (refreshedCookie) {
            return {
                success: true,
                refreshedCookie: refreshedCookie
            };
        } else {
            return {
                success: false,
                error: "Cookie rinnovato non trovato"
            };
        }
    } catch (error) {
        console.error("Errore nel rinnovo del cookie:", error);
        return {
            success: false,
            robloxDebugResponse: error.response?.data || 'Errore sconosciuto'
        };
    }
}

module.exports = {
    generateAuthTicket,
    redeemAuthTicket
};