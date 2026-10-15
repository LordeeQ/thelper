chrome.runtime.onInstalled.addListener((details) => {
  // Тем осталось две. Снятые значения сопоставляем ближайшей по светлоте —
  // иначе интерфейс остался бы в теме, которую больше нечем переключить.
  chrome.storage.local.get(['twfm_theme'], r => {
    const old = r.twfm_theme;
    if (old && old !== 'dark' && old !== 'white') {
      chrome.storage.local.set({ twfm_theme: old === 'coffee' ? 'white' : 'dark' });
    }
  });

  chrome.contextMenus.create({
    id: "qpi-open",
    title: "⚡ Быстрые фразы",
    contexts: ["editable"]           // no "selection": selecting text shows only "Добавить"
  });
  chrome.contextMenus.create({
    id: "qpi-add-phrase",
    title: "➕ Добавить в «Быстрые фразы»",
    contexts: ["selection"]
  });

  // Show the welcome tour only on a fresh install (not on auto-updates)
  if (details.reason === "install") {
    chrome.tabs.create({ url: chrome.runtime.getURL("src/onboarding/onboarding.html") });
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;

  if (info.menuItemId === "qpi-open") {
    // executeScript is more reliable than sendMessage for iframe-heavy SPAs
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => { document.dispatchEvent(new CustomEvent('__QPI_OPEN__')); }
    }).catch(() => {
      // Fallback if scripting fails (restricted pages)
      chrome.tabs.sendMessage(tab.id, { type: "QPI_OPEN_FROM_CONTEXT" }).catch(() => {});
    });
    return;
  }

  if (info.menuItemId === "qpi-add-phrase") {
    const text = info.selectionText || "";
    if (!text.trim()) return;
    // The phrase menu UI lives in the top frame, so dispatch there.
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: t => { document.dispatchEvent(new CustomEvent('__QPI_ADD_PHRASE__', { detail: t })); },
      args: [text]
    }).catch(() => {
      chrome.tabs.sendMessage(tab.id, { type: "QPI_ADD_PHRASE", text }).catch(() => {});
    });
  }
});
