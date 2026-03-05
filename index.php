<?php
// Disabilita cache per tutte le richieste
header('Cache-Control: no-cache, no-store, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
  ob_start();
  $input = json_decode(file_get_contents('php://input'), true);
  $tournament = $input;
  if ($tournament && isset($tournament['TournamentName'])) {
    function loadConstantsFromJS() {
      try {
        $constantsFile = __DIR__ . '/constants.js';
        if (!file_exists($constantsFile)) {
          return ['MAPS' => [], 'EMOTES' => []];
        }
        $content = file_get_contents($constantsFile);
        if ($content === false) {
          return ['MAPS' => [], 'EMOTES' => []];
        }     
        $maps = [];
        $emotes = [];     
        if (preg_match('/export const MAPS = Object\.freeze\(\{/s', $content, $match, PREG_OFFSET_CAPTURE)) {
          $start = $match[0][1] + strlen($match[0][0]);
          $depth = 1;
          $end = $start;
          while ($depth > 0 && $end < strlen($content)) {
            if ($content[$end] === '{') $depth++;
            if ($content[$end] === '}') $depth--;
            $end++;
          }
          $mapsContent = substr($content, $start, $end - $start - 1);
          if (preg_match_all('/"((?:[^"\\\\]|\\\\.)*)"\s*:\s*"((?:[^"\\\\]|\\\\.)*)"/', $mapsContent, $mapsPairs, PREG_SET_ORDER)) {
            foreach ($mapsPairs as $pair) {
              $maps[stripslashes($pair[2])] = stripslashes($pair[1]);
            }
          }
        }
        
        if (preg_match('/export const EMOTES = Object\.freeze\(\{/s', $content, $match, PREG_OFFSET_CAPTURE)) {
          $start = $match[0][1] + strlen($match[0][0]);
          $depth = 1;
          $end = $start;
          while ($depth > 0 && $end < strlen($content)) {
            if ($content[$end] === '{') $depth++;
            if ($content[$end] === '}') $depth--;
            $end++;
          }
          $emotesContent = substr($content, $start, $end - $start - 1);
          if (preg_match_all('/"((?:[^"\\\\]|\\\\.)*)"\s*:\s*(-?\d+)/', $emotesContent, $emotesPairs, PREG_SET_ORDER)) {
            foreach ($emotesPairs as $pair) {
              $emotes[(int)$pair[2]] = stripslashes($pair[1]);
            }
          }
        }
        
        return ['MAPS' => $maps, 'EMOTES' => $emotes];
      } catch (Exception $e) {
        return ['MAPS' => [], 'EMOTES' => []];
      }
    }
    
    $constants = loadConstantsFromJS();
    $MAPS = $constants['MAPS'];
    $EMOTES = $constants['EMOTES'];

    function getMapFriendlyName($sceneId, $MAPS) {
      return isset($MAPS[$sceneId]) ? $MAPS[$sceneId] : $sceneId;
    }

    function getEmoteFriendlyName($emoteId, $EMOTES) {
      return isset($EMOTES[$emoteId]) ? $EMOTES[$emoteId] : (string)$emoteId;
    }

    function getEmoteEmoji($emoteName) {
      $emojiMap = [
        'Punch' => '<:Punch:1476248401996939468>',
        'Fire Punch' => '<:FirePunch:1476248439162404897>',
        'Kick' => '<:Kick:1476248743442518081>',
        'Wet Kick' => '<:WaterKick:1476248775315030046>',
        'Banana' => '<:Banana:1476248823536816416>',
        'Golden Banana' => '<:GoldenBanana:1476248846353829892>',
        'Invisibility' => '<:Invisibility:1476251921428906054>',
        'MrBeast Case' => '<:Case:1476251884565168362>',
        'Hug' => '<:Hug:1476248796391411885>',
        'Charged Hug' => '<:ElectricHug:1476251980593893476>',
        'Ball' => '<:Ball:1476251900054733018>',
        'Beast Lightning' => '<:zeus:1467606163037360312>',
        'Tetris' => '<:tetris:1467606083966210271>',
        'Snowball' => '<:snowball:1467606006430433635>',
        'Spatula' => '<:spatula:1467606225079238798>',
        'Karate Chop' => '<:karatechop:1467606298492407852>',
        'Force Shield' => '<:shield:1467606934487040202>'
      ];
      
      // Rimuovi "only" dal nome se presente (case-insensitive)
      $cleanName = preg_replace('/\s*only\s*/i', '', trim($emoteName));
      
      if (isset($emojiMap[$cleanName])) {
        return $emojiMap[$cleanName];
      }
      
      // Se non trovato nella mappa, restituisci il nome originale
      return $emoteName;
    }

    function getAllEmoteEmojis() {
      return [
        '<:Punch:1476248401996939468>',
        '<:FirePunch:1476248439162404897>',
        '<:Kick:1476248743442518081>',
        '<:WaterKick:1476248775315030046>',
        '<:Banana:1476248823536816416>',
        '<:GoldenBanana:1476248846353829892>',
        '<:Invisibility:1476251921428906054>',
        '<:Case:1476251884565168362>',
        '<:Hug:1476248796391411885>',
        '<:ElectricHug:1476251980593893476>',
        '<:Ball:1476251900054733018>',
        '<:zeus:1467606163037360312>',
        '<:tetris:1467606083966210271>',
        '<:snowball:1467606006430433635>',
        '<:spatula:1467606225079238798>',
        '<:karatechop:1467606298492407852>',
        '<:shield:1467606934487040202>'
      ];
    }

    function getPhaseTypeName($phaseType) {
      switch ((int)$phaseType) {
        case 0:
          return "Normal Phase (Round Robin)";
        case 1:
          return "Arena";
        case 2:
          return "Bracket (Single Elimination)";
        default:
          return "Phase";
      }
    }

    function getTimestamp($dateValue) {
      if (!$dateValue) return 0;
      
      if (is_array($dateValue) && isset($dateValue['$date'])) {
        $timestamp = is_numeric($dateValue['$date']) ? $dateValue['$date'] / 1000 : strtotime($dateValue['$date']);
      } elseif (is_numeric($dateValue)) {
        $timestamp = $dateValue / 1000;
      } else {
        $timestamp = strtotime($dateValue);
      }
      
      return $timestamp !== false ? floor($timestamp) : 0;
    }
    $colorHex = $tournament['TournamentColor'] ?? '22c55e';
    $colorHex = str_replace('#', '', $colorHex);
    $decimalColor = hexdec(substr($colorHex, 0, 6));

    $partySize = $tournament['PartySize'] ?? 1;
    $maxPlayersPerMatch = $tournament['MaxPlayersPerMatch'] ?? 2;
    $isFFA = $partySize === 1 && $maxPlayersPerMatch > 2;
    if ($isFFA) {
      $modeText = implode('v', array_fill(0, $maxPlayersPerMatch, '1'));
    } else {
      $modeText = "{$partySize}v{$partySize}";
    }

    $disabledEmotes = $tournament['Properties']['DisabledEmotes'] ?? [];
    $selectedSpecialEmotes = $tournament['Properties']['SelectedSpecialEmotes'] ?? [];
    
    // Emote speciali che NON vengono salvate nel database quando selezionate
    $specialEmoteIds = [];
    foreach ($EMOTES as $emoteId => $emoteName) {
      if (in_array($emoteName, ['Invisibility', 'Punch', 'Fire Punch', 'Banana', 'Golden Banana', 
                                  'MrBeast Case', 'Ball', 'Hug', 'Charged Hug', 'Kick', 'Wet Kick',
                                  'Beast Lightning', 'Tetris', 'Snowball', 'Spatula', 'Karate Chop', 'Force Shield'])) {
        $specialEmoteIds[] = $emoteId;
      }
    }
    
    // Ottieni tutte le emote normali (escludendo quelle con "only" nel nome)
    $normalEmoteIds = [];
    foreach ($EMOTES as $emoteId => $emoteName) {
      if ($emoteId > 0 && stripos($emoteName, 'only') === false) {
        $normalEmoteIds[] = $emoteId;
      }
    }
    
    // Ottieni tutte le emote "only" (quelle con "only" nel nome)
    $onlyEmoteIds = [];
    foreach ($EMOTES as $emoteId => $emoteName) {
      if (stripos($emoteName, 'only') !== false) {
        $onlyEmoteIds[] = $emoteId;
      }
    }
    
    // Ottieni tutte le emote (normali + speciali, escludendo le "only")
    $allEmoteIdsExceptOnly = array_merge($normalEmoteIds, $specialEmoteIds);
    
    // Le emote "only" selezionate sono quelle CHE SONO in DisabledEmotes (vengono salvate come valori negativi)
    $enabledOnlyEmotes = array_filter($onlyEmoteIds, function($id) use ($disabledEmotes) {
      return in_array($id, $disabledEmotes);
    });
    
    // Rimuovi le emote "only" da DisabledEmotes per il calcolo
    $disabledEmotesWithoutOnly = array_filter($disabledEmotes, function($id) use ($onlyEmoteIds) {
      return !in_array($id, $onlyEmoteIds);
    });
    
    // Caso 1: Se DisabledEmotes contiene tutte le emote tranne le "only", significa che nessuna emote è selezionata
    $allEmotesDisabled = count($disabledEmotesWithoutOnly) > 0 && 
                         count($disabledEmotesWithoutOnly) >= count($allEmoteIdsExceptOnly) &&
                         count(array_diff($allEmoteIdsExceptOnly, $disabledEmotesWithoutOnly)) === 0;
    
    // Caso 2: Se DisabledEmotes è completamente vuoto, significa che tutte le emote sono selezionate
    // Se DisabledEmotes contiene solo emote "only", quelle sono le emote selezionate (non "All Enabled")
    $allEmotesEnabled = count($disabledEmotes) === 0;
    
    // Caso 3: Se DisabledEmotes contiene alcune emote (ma non tutte), significa che alcune emote speciali sono selezionate
    // Le emote speciali selezionate sono quelle che NON sono in DisabledEmotes
    $selectedSpecialEmoteIds = [];
    
    // Se il campo SelectedSpecialEmotes esiste e ha valori, usalo sempre (ha priorità)
    if (count($selectedSpecialEmotes) > 0) {
      $selectedSpecialEmoteIds = $selectedSpecialEmotes;
    } else if (!$allEmotesDisabled && !$allEmotesEnabled) {
      // Altrimenti, deduci dalle emote disabilitate: le emote speciali selezionate sono quelle NON in DisabledEmotes
      $selectedSpecialEmoteIds = array_filter($specialEmoteIds, function($id) use ($disabledEmotesWithoutOnly) {
        return !in_array($id, $disabledEmotesWithoutOnly);
      });
    } else if ($allEmotesEnabled) {
      // Se tutte le emote sono abilitate, tutte le emote speciali sono selezionate
      $selectedSpecialEmoteIds = $specialEmoteIds;
    }
    
    // Controlla se tutte le emote speciali sono selezionate
    $allSpecialEmotesSelected = count($selectedSpecialEmoteIds) > 0 && 
                                 count($selectedSpecialEmoteIds) === count($specialEmoteIds);
    
    // Genera il testo delle emote
    // Priorità 1: Se tutte le emote sono abilitate, mostra tutte le emoji personalizzate
    if ($allEmotesEnabled) {
      // DisabledEmotes vuoto = tutte le emote sono state mandate/abilitate -> mostra tutte le emoji
      $allEmojis = getAllEmoteEmojis();
      $emotesText = implode(' ', $allEmojis);
    } else if ($allEmotesDisabled) {
      // DisabledEmotes contiene tutte le emote = nessuna emote è stata mandata/abilitata -> mostra tutte le emoji
      $allEmojis = getAllEmoteEmojis();
      $emotesText = implode(' ', $allEmojis);
    } else if (count($enabledOnlyEmotes) > 0) {
      // Priorità 2: Se ci sono emote "only" abilitate, mostra "Only [Emoji]"
      $onlyEmoteEmojis = array_map(function($emoteId) use ($EMOTES) {
        $emoteName = getEmoteFriendlyName($emoteId, $EMOTES);
        // Rimuovi "only" dal nome se presente
        $cleanName = preg_replace('/\s*only\s*/i', '', trim($emoteName));
        // Ottieni l'emoji corrispondente
        $emoji = getEmoteEmoji($cleanName);
        return $emoji;
      }, $enabledOnlyEmotes);
      $emotesText = "Only " . implode(' ', $onlyEmoteEmojis);
    } else if ($allSpecialEmotesSelected) {
      // Tutte le emote speciali sono selezionate -> mostra emoji "no"
      $emotesText = "<:sg_cross:1476256806895484969>";
    } else if (count($selectedSpecialEmoteIds) === 0) {
      // Nessuna emote speciale selezionata -> mostra emoji "no"
      $emotesText = "<:sg_cross:1476256806895484969>";
    } else {
      // Alcune emote speciali selezionate (ma non tutte) -> mostra le emoji
      $emoteEmojis = array_map(function($emoteId) use ($EMOTES) {
        $emoteName = getEmoteFriendlyName($emoteId, $EMOTES);
        return getEmoteEmoji($emoteName);
      }, $selectedSpecialEmoteIds);
      $emotesText = implode(' ', $emoteEmojis);
    }

    $signupTimestamp = getTimestamp($tournament['SignupStart'] ?? null);
    $startTimestamp = getTimestamp($tournament['StartTime'] ?? null);

    $tournamentImage = $tournament['TournamentImage'] ?? '';
    $defaultImage = "https://i.imgur.com/BbqF8LO.png";

    $content = "## New tournament scheduled on Stumble Priz<:StumblePriz:1476250538252308622>!\n<@&1473700227776118878>";
    
    $tournamentImageUrl = $tournamentImage ?: $defaultImage;
    
    $components = [];
    
    $components[] = [
      "type" => 9,
      "components" => [
        [
          "type" => 10,
          "content" => $content
        ]
      ],
      "accessory" => [
        "type" => 11,
        "media" => [
          "url" => $tournamentImageUrl
        ]
      ]
    ];
    
    $components[] = [
      "type" => 14
    ];
    
    $mainInfo = "";
    $mainInfo .= "<:dot:1476248608369279129> Name: **" . htmlspecialchars($tournament['TournamentName'] ?? 'Unknown') . "**\n";
    $mainInfo .= "<:dot:1476248608369279129> Region: **" . strtoupper($tournament['Region'] ?? 'eu') . "**\n";
    $mainInfo .= "<:dot:1476248608369279129> Emotes: **" . $emotesText . "**\n";
    $mainInfo .= "<:dot:1476248608369279129> Mode: **" . $modeText . "**\n";
    $mainInfo .= "<:dot:1476248608369279129> Max Invites: **" . ($tournament['MaxInvites'] ?? 0) . "**\n";
    $mainInfo .= "<:dot:1476248608369279129> Phases: **" . (count($tournament['Phases'] ?? [])) . "**\n";
    if ($signupTimestamp > 0) {
      $mainInfo .= "<:dot:1476248608369279129> Signup Opens: <t:{$signupTimestamp}:R>\n";
    }
    if ($startTimestamp > 0) {
      $mainInfo .= "<:dot:1476248608369279129> Starts: <t:{$startTimestamp}:R>\n";
    }
    $mainInfo .= "\n";
    
    $components[] = [
      "type" => 10,
      "content" => $mainInfo
    ];
    
    $components[] = [
      "type" => 14,
      "divider" => true
    ];
    
    $rankingInfo = "<:ranking:1476251355420299345> Count on Leaderboard: **" . ((int)($tournament['CountOnLeaderBoard'] ?? 1) === 1 ? 'Yes' : 'No') . "**\n";
    
    // Funzione per ottenere l'emoji del Wprizepool
    function getWprizepoolEmoji($wprizepool) {
      $emojiMap = [
        '<color=#ffd802>[W]' => '<:rs_gold:1476248896572358756>',
        '<color=#cc8031>[W]' => '<:rs_bronze:1476248878008369255>',
        '<color=#c0c0c0>[W]' => '<:rs_silver:1476248951270412319>',
        '<color=#09ff05>[W]' => '<:GreenW:1476248970874322975>',
        '<color=#fa0000>[W]' => '<:W_:1476248992936628485>',
        '<color=#0136fc>[W]' => '<:WW:1476250930084188199>',
      ];
      return isset($emojiMap[$wprizepool]) ? $emojiMap[$wprizepool] : '';
    }
    
    // Aggiungi informazioni sulle gemme per il top 1 (solo se > 0)
    $prizes = $tournament['Prizes'] ?? [];
    $top1Amount = 0;
    foreach ($prizes as $prize) {
      if (isset($prize['position']) && (int)$prize['position'] === 1) {
        $top1Amount = isset($prize['amount']) ? (int)$prize['amount'] : 0;
        break;
      }
    }
    
    $wprizepool = $tournament['Wprizepool'] ?? '';
    $wprizepoolEmoji = getWprizepoolEmoji($wprizepool);
    
    if ($top1Amount > 0) {
      if ($wprizepoolEmoji) {
        $rankingInfo .= "<:gems:1476248585325772852> Gems for Top 1: **" . $top1Amount . "** + " . $wprizepoolEmoji . "\n";
      } else {
        $rankingInfo .= "<:gems:1476248585325772852> Gems for Top 1: **" . $top1Amount . "**\n";
      }
    } else if ($wprizepoolEmoji) {
      $rankingInfo .= $wprizepoolEmoji . " <-- Prizepool\n";
    }
    
    // Aggiungi informazioni sullo stream (solo se presente)
    $streamUrl = '';
    $streamUrlRaw = $tournament['Properties']['StreamURL'] ?? '';
    if (is_array($streamUrlRaw)) {
      $streamUrl = !empty($streamUrlRaw) ? $streamUrlRaw[0] : '';
    } else {
      $streamUrl = $streamUrlRaw;
    }
    
    if (!empty($streamUrl) && trim($streamUrl) !== '') {
      $streamUrlLower = strtolower($streamUrl);
      $streamEmoji = '';
      
      if (strpos($streamUrlLower, 'twitch.tv') !== false || strpos($streamUrlLower, 'twitch.com') !== false) {
        $streamEmoji = '<:Twitch:1476250872249057494>';
      } elseif (strpos($streamUrlLower, 'youtube.com') !== false || strpos($streamUrlLower, 'youtu.be') !== false) {
        $streamEmoji = '<:yt:1476250853529751665>';
      }
      
      $rankingInfo .= $streamEmoji . " Stream on: " . htmlspecialchars($streamUrl) . "\n";
    }
    
    $components[] = [
      "type" => 10,
      "content" => $rankingInfo
    ];
    
    $components[] = [
      "type" => 14,
      "divider" => true
    ];
    
    $phases = $tournament['Phases'] ?? [];
    if (count($phases) > 0) {
      foreach ($phases as $index => $phase) {
        $phaseTypeName = getPhaseTypeName($phase['PhaseType'] ?? 0);
        $maps = $phase['Maps'] ?? [];
        
        // Gestisci le mappe: possono essere array o stringa con virgola e spazio
        $mapNames = "NA";
        if (!empty($maps)) {
          if (is_array($maps)) {
            // Se è un array, converti ogni valore in nome friendly
            $mapNames = implode(', ', array_map(function($sceneId) use ($MAPS) {
              return getMapFriendlyName($sceneId, $MAPS);
            }, $maps));
          } else if (is_string($maps) && trim($maps) !== '') {
            // Se è una stringa, dividi per ", " e converti ogni valore in nome friendly
            $mapsArray = explode(', ', $maps);
            $mapNames = implode(', ', array_map(function($sceneId) use ($MAPS) {
              return getMapFriendlyName(trim($sceneId), $MAPS);
            }, $mapsArray));
          }
        }

        $phaseContent = "<:StumblePriz:1476250538252308622> - Phase " . ($index + 1) . ": **" . htmlspecialchars($phaseTypeName) . "**\n";

        if (isset($phase['MaxTeams'])) {
          $phaseContent .= "<:dot:1476248608369279129> Max Teams: **" . $phase['MaxTeams'] . "**\n";
        }

        $phaseContent .= "<:dot:1476248608369279129> Maps: **" . htmlspecialchars($mapNames) . "**\n";

        if (isset($phase['RoundCount'])) {
          $phaseContent .= "<:dot:1476248608369279129> Rounds: **" . $phase['RoundCount'] . "**\n";
        }

        if (isset($phase['GroupCount']) && $phase['GroupCount'] > 1) {
          $phaseContent .= "<:dot:1476248608369279129> Passing Teams: **" . $phase['GroupCount'] . "**\n";
        }

        $components[] = [
          "type" => 10,
          "content" => $phaseContent
        ];

        if ($index < count($phases) - 1) {
          $components[] = [
            "type" => 14
          ];
        }
      }
    }
    
    $webhookData = [
      "type" => 0,
      "flags" => 32768, // IS_COMPONENTS_V2
      "components" => [
        [
          "type" => 17,
          "components" => $components,
          "accent_color" => $decimalColor
        ]
      ]
    ];

    $baseWebhookUrl = "";
    
    $webhookUrl = str_replace(
      "https://discord.com/api/webhooks/",
      "https://discord.com/api/v10/webhooks/",
      $baseWebhookUrl
    ) . "?wait=true&with_components=true";
    
    $ch = curl_init($webhookUrl);
    curl_setopt_array($ch, [
      CURLOPT_URL => $webhookUrl,
      CURLOPT_POST => true,
      CURLOPT_POSTFIELDS => json_encode($webhookData),
      CURLOPT_HTTPHEADER => ["Content-Type: application/json"],
      CURLOPT_RETURNTRANSFER => true,
      CURLOPT_TIMEOUT => 10,
      CURLOPT_CONNECTTIMEOUT => 10,
      CURLOPT_SSL_VERIFYPEER => true,
      CURLOPT_SSL_VERIFYHOST => 2,
      CURLOPT_USERAGENT => "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      CURLOPT_FOLLOWLOCATION => true,
      CURLOPT_MAXREDIRS => 3
    ]);
    
    $result = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    $curlErrno = curl_errno($ch);
    curl_close($ch);

    $responseData = json_decode($result, true);
    $isUnknownChannel = ($httpCode === 400 && isset($responseData['code']) && $responseData['code'] === 10003);
    $webhookDataNoThread = $webhookData;
    unset($webhookDataNoThread['thread_id']);
    
    if ($isUnknownChannel) {
      $webhookUrlNoThread = str_replace(
        "https://discord.com/api/webhooks/",
        "https://discord.com/api/v10/webhooks/",
        $baseWebhookUrl
      ) . "?wait=true&with_components=true";
      
      $ch2 = curl_init($webhookUrlNoThread);
      curl_setopt_array($ch2, [
        CURLOPT_URL => $webhookUrlNoThread,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($webhookDataNoThread),
        CURLOPT_HTTPHEADER => ["Content-Type: application/json"],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 10,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_USERAGENT => "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 3
      ]);
      
      $result = curl_exec($ch2);
      $httpCode = curl_getinfo($ch2, CURLINFO_HTTP_CODE);
      $curlError = curl_error($ch2);
      $curlErrno = curl_errno($ch2);
      curl_close($ch2);
    }
    
    if ($curlErrno !== 0 || ($httpCode < 200 || $httpCode >= 300)) {
      $fallbackUrl = $isUnknownChannel ? 
        str_replace("https://discord.com/api/webhooks/", "https://discord.com/api/v10/webhooks/", $baseWebhookUrl) . "?wait=true" :
        $webhookUrl;
      
      $fallbackPayload = $isUnknownChannel ? $webhookDataNoThread : $webhookData;
      
      $context = stream_context_create([
        'http' => [
          'method' => 'POST',
          'header' => "Content-Type: application/json\r\n",
          'content' => json_encode($fallbackPayload),
          'timeout' => 10,
          'ignore_errors' => true
        ],
        'ssl' => [
          'verify_peer' => true,
          'verify_peer_name' => true
        ]
      ]);
      
      $result = @file_get_contents($fallbackUrl, false, $context);
      $httpCode = 0;
      
      if (isset($http_response_header)) {
        foreach ($http_response_header as $header) {
          if (preg_match('/HTTP\/\d\.\d\s+(\d+)/', $header, $matches)) {
            $httpCode = (int)$matches[1];
            break;
          }
        }
      }
    }

    if ($httpCode >= 200 && $httpCode < 300) {
      ob_clean();
      header('Content-Type: application/json');
      exit(json_encode(["success" => true, "method" => $curlErrno === 0 ? "curl" : "file_get_contents"]));
    } else {
      $errorMsg = "Webhook failed";
      if ($isUnknownChannel) {
        $errorMsg = "Thread/Channel not found or inaccessible. Tried both with and without thread_id.";
      }
      ob_clean();
      header('Content-Type: application/json');
      exit(json_encode([
        "success" => false, 
        "error" => $errorMsg, 
        "httpCode" => $httpCode, 
        "curlErrno" => $curlErrno,
        "curlError" => $curlError,
        "response" => $result
      ]));
    }
  }

  ob_clean();
  header('Content-Type: application/json');
  exit(json_encode(["success" => false, "error" => "Missing TournamentName"]));
}
?>
<!DOCTYPE html>
<html lang="en">
  
<meta http-equiv="content-type" content="text/html;charset=utf-8"/>
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
    <meta http-equiv="Pragma" content="no-cache" />
    <meta http-equiv="Expires" content="0" />
    <link rel="icon" href="/favicon.ico" type="image/x-icon">
<link rel="shortcut icon" href="/favicon.ico" type="image/x-icon">
    <title>Stumble Priz Dashboard</title>
    <link rel="stylesheet" href="styles.css?v=<?php echo time(); ?>"/>
  </head>
  <body>
    <div class="login-wrapper" id="loginScreen">
      <div class="login-container">
        <div class="logo">
          <h1>Stumble Priz</h1>
          <p>Admin Dashboard</p>
        </div>
        <form id="loginForm">
          <div class="form-group">
            <label for="usernameInput">Username</label>
            <input type="text" id="usernameInput" placeholder="Enter username" required autocomplete="username" />
          </div>
          <div class="form-group">
            <label for="passwordInput">Password</label>
            <input
              type="password"
              id="passwordInput"
              placeholder="Enter password"
              required
              autocomplete="current-password"
            />
          </div>
          <button type="submit" class="btn">Sign In</button>
          <div class="error-msg" id="loginError"></div>
        </form>
      </div>
    </div>

    <div class="main-container" id="mainApp">
      <nav class="navbar">
        <h1>Stumble Priz Dashboard</h1>
        <button class="btn-logout" onclick="HandleLogout()">Sign Out</button>
      </nav>

      <div class="tabs">
        <button class="tab-btn active" onclick="SwitchTab('create')">Create Tournaments</button>
        <button class="tab-btn" onclick="SwitchTab('view')">View Tournaments</button>
      </div>

      <div class="content-panel active" id="createPanel">
        <h2 class="section-title">Make new tournament</h2>
        <form id="tournamentForm">
          <div class="form-group">
            <label for="tournamentName">Tournament Name</label>
            <input type="text" id="tournamentName" placeholder="Enter tournament name" required />
          </div>

          <div class="form-row">
            <div class="form-group">
              <label for="tournamentImage">Image URL</label>
              <input type="url" id="tournamentImage" placeholder="https://i.imgur.com/BbqF8LO.png" />
            </div>
            <div class="form-group">
              <label for="tournamentColor">Color</label>
              <input type="color" id="tournamentColor" value="#22c55e" />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label for="startTime">Start Time</label>
              <input type="datetime-local" id="startTime" required />
            </div>
            <div class="form-group">
              <label for="signupStart">Signup Start</label>
              <input type="datetime-local" id="signupStart" required />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label for="maxInvites">Max Players</label>
              <select id="maxInvites" required></select>
            </div>
            <div class="form-group">
              <label for="partySize">Mode</label>
              <select id="partySize" required>
                <option value="1">1v1</option>
                <option value="2">2v2</option>
                <option value="3">3v3</option>
                <option value="4">4v4</option>
                <option value="5">5v5</option>
                <option value="6">6v6</option>
                <option value="7">7v7</option>
              </select>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label for="entryFee">Entry Fee</label>
              <input type="number" id="entryFee" value="0" min="0" />
            </div>
            <div class="form-group">
              <label for="prizeType">Prize type</label>
              <select id="prizeType">
                <option value="gems" selected>Gems</option>
              </select>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label for="wprizepool">W Prizepool</label>
              <select id="wprizepool">
                <option value="">None</option>
                <option value="<color=#cc8031>[W]">Bronze</option>
                <option value="<color=#ffd802>[W]">Gold</option>
                <option value="<color=#c0c0c0>[W]">Silver</option>
                <option value="<color=#09ff05>[W]">Green</option>
                <option value="<color=#fa0000>[W]">Red</option>
                <option value="<color=#0136fc>[W]">Blue</option>
              </select>
            </div>
          </div>

          <div class="form-group">
            <label>Gems per position</label>
            <div id="prizesByPosition" class="prizes-grid">
              <div class="form-row">
                <div class="form-group prize-position">
                  <label for="prizePos1">1st place</label>
                  <input type="number" id="prizePos1" min="0" max="5000" value="0" placeholder="0" />
                </div>
              </div>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label for="region">Region</label>
              <select id="region" required>
                <option value="eu">Europe</option>
                <option value="asia">Asia</option>
                <option value="sa">South America</option>
                <option value="us">North America</option>
              </select>
            </div>
            <div class="form-group">
              <label for="tournamentType">Type</label>
              <select id="tournamentType">
                <option value="0">Generic</option>
                <option value="1">Premium</option>
                <option value="2">Private</option>
                <option value="3">Testing</option>
              </select>
            </div>
          </div>

          <div class="checkbox-group">
            <input type="checkbox" id="countOnLeaderboard" checked />
            <label for="countOnLeaderboard">Count on Leaderboard</label>
          </div>

          <div class="checkbox-group">
            <input type="checkbox" id="isInviteOnly" />
            <label for="isInviteOnly">Invitation Only</label>
          </div>

          <div class="form-group">
            <label for="invitedIds">Invited User IDs (comma-separated)</label>
            <input type="text" id="invitedIds" placeholder="123, 678, 4251..." />
          </div>

          <div class="form-group">
            <label for="streamUrl">Stream URL</label>
            <input type="url" id="streamUrl" placeholder="https://twitch.tv/..." />
          </div>

          <div class="form-group">
            <label>Enable Emotes</label>
            <button type="button" class="btn btn-secondary" onclick="OpenEmoteSelector()">
              Select Enabled Emotes
            </button>
            <div id="selectedEmotesDisplay"></div>
          </div>

          <div id="phasesContainer"></div>

          <button type="submit" class="btn">Save Tournament</button>
        </form>
        <div class="message-box" id="createMessage"></div>
      </div>

      <div class="content-panel" id="viewPanel">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 28px;">
          <h2 class="section-title" style="margin-bottom: 0;">All tournaments</h2>
          <button type="button" class="btn" onclick="RefreshTournaments()" style="padding: 6px 12px; font-size: 14px; width: auto; min-width: auto;">Refresh</button>
        </div>
        <div class="search-controls">
          <input type="text" id="searchInput" placeholder="Search tournaments..." aria-label="Search tournaments" />
          <label for="statusFilter" class="visually-hidden">Filter by status</label>
          <select id="statusFilter" aria-label="Filter tournaments by status">
            <option value="">All Status</option>
            <option value="0">Not Started</option>
            <option value="1">Registration Open</option>
            <option value="2">Registration Closed</option>
            <option value="5">Running</option>
            <option value="3">Finished</option>
          </select>
        </div>
        <div class="tournament-list" id="tournamentList">
          <div class="loading">Loading tournaments...</div>
        </div>
      </div>
    </div>

    <div class="modal" id="emoteModal">
      <div class="modal-content">
        <div class="modal-header" style="display: flex; align-items: center; justify-content: space-between;">
          <h2>Select Enabled Emotes</h2>
          <div style="display: flex; align-items: center; gap: 12px;">
            <button type="button" class="btn" onclick="SelectAllEmotes()" style="padding: 6px 12px; font-size: 14px; width: auto; min-width: auto;">No Emote</button>
            <button class="btn-close" onclick="CloseEmoteModal()">×</button>
          </div>
        </div>
        <div class="search-box">
          <input type="text" id="emoteSearch" placeholder="Search emotes..." />
        </div>
        <div class="grid" id="emoteGrid"></div>
        <button class="btn" onclick="CloseEmoteModal()">Done</button>
      </div>
    </div>

    <div class="modal" id="mapModal">
      <div class="modal-content">
        <div class="modal-header">
          <h2>Select Map</h2>
          <button class="btn-close" onclick="CloseMapModal()">×</button>
        </div>
        <div class="search-box">
          <input type="text" id="mapSearch" placeholder="Search maps..." />
        </div>
        <div class="grid" id="mapGrid"></div>
      </div>
    </div>

    <script type="module" src="index.js?v=<?php echo time(); ?>"></script>
  </body>
</html>