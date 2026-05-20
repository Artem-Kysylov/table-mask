/**
 * TableMask Worker — Syntax Labs
 * Фоновая обработка маскирования без блокировки UI
 */

importScripts('js/engine.js');

self.onmessage = function (event) {
    const { requestId, rawText, activeFilters, customKeywords } = event.data;
    const result = self.TableMaskEngine.process(rawText, activeFilters, customKeywords);

    self.postMessage({
        requestId,
        plainText: result.plainText,
        htmlText: result.htmlText,
        leakCount: result.leakCount,
        sessionMap: Array.from(self.TableMaskEngine.sessionMap.entries())
    });
};
