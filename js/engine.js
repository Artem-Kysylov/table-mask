/**
 * TableMask Engine — Syntax Labs
 * Локальная фильтрация PII через оптимизированные регулярные выражения
 */

const PII_RULES = {
    email: {
        id: 'email',
        regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
        tokenPrefix: 'EMAIL'
    },
    phone: {
        id: 'phone',
        regex: /(?:\+|\b)?[1-9]\d{0,2}[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
        tokenPrefix: 'PHONE'
    },
    card: {
        id: 'card',
        regex: /\b(?:\d[ -]*?){13,16}\b/g,
        tokenPrefix: 'CREDIT_CARD'
    },
    ip: {
        id: 'ip',
        regex: /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g,
        tokenPrefix: 'IP_ADDRESS'
    },
    name: {
        id: 'name',
        regex: /\b[A-ZА-Я][a-zа-я]+[-'\s][A-ZА-Я][a-zа-я]+\b/g,
        tokenPrefix: 'NAME'
    }
};

const REGEX_ESCAPE_PATTERN = /[-\/\\^$*+?.()|[\]{}]/g;
const TOKEN_PATTERN = /\[([A-Z][A-Z0-9_]*_\d+)\]/g;

class TableMaskEngine {
    constructor() {
        this.rules = PII_RULES;
        this.sessionMap = new Map();
        this.counters = {};
        this.valueToToken = new Map();
    }

    clearSession() {
        this.sessionMap.clear();
        this.valueToToken.clear();
        this.counters = {};
    }

    escapeHtml(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    escapeRegex(text) {
        return text.replace(REGEX_ESCAPE_PATTERN, '\\$&');
    }

    buildMaskTag(type, token) {
        return `<span class="mask-tag" data-type="${type}">${token}</span>`;
    }

    resolveToken(tokenPrefix, originalValue) {
        const valueKey = `${tokenPrefix}:${originalValue}`;

        if (this.valueToToken.has(valueKey)) {
            return this.valueToToken.get(valueKey);
        }

        if (!this.counters[tokenPrefix]) {
            this.counters[tokenPrefix] = 0;
        }

        this.counters[tokenPrefix] += 1;
        const token = `[${tokenPrefix}_${this.counters[tokenPrefix]}]`;

        this.sessionMap.set(token, originalValue);
        this.valueToToken.set(valueKey, token);

        return token;
    }

    maskMatch(match, tokenPrefix, typeId) {
        const token = this.resolveToken(tokenPrefix, match);

        return {
            token,
            plain: token,
            html: this.buildMaskTag(typeId, token)
        };
    }

    applyRuleReplacements(text, htmlText, rule) {
        let leakCount = 0;
        const tokenCache = new Map();

        const getTokenForMatch = (match) => {
            if (tokenCache.has(match)) {
                return tokenCache.get(match);
            }

            leakCount += 1;
            const masked = this.maskMatch(match, rule.tokenPrefix, rule.id);
            tokenCache.set(match, masked);
            return masked;
        };

        rule.regex.lastIndex = 0;

        const plainResult = text.replace(rule.regex, (match) => {
            return getTokenForMatch(match).plain;
        });

        rule.regex.lastIndex = 0;

        const htmlResult = htmlText.replace(rule.regex, (match) => {
            return getTokenForMatch(match).html;
        });

        return { plainResult, htmlResult, leakCount };
    }

    applyCustomKeywords(plainResult, htmlResult, customKeywordsString) {
        if (!customKeywordsString) {
            return { plainResult, htmlResult, leakCount: 0 };
        }

        const keywords = customKeywordsString
            .split(',')
            .map((keyword) => keyword.trim())
            .filter((keyword) => keyword.length > 0);

        if (keywords.length === 0) {
            return { plainResult, htmlResult, leakCount: 0 };
        }

        const escapedKeywords = keywords.map((keyword) => this.escapeRegex(keyword));
        const customRegex = new RegExp(`\\b(${escapedKeywords.join('|')})\\b`, 'gi');
        const tokenCache = new Map();
        let leakCount = 0;

        const getTokenForMatch = (match) => {
            const cacheKey = match.toLowerCase();

            if (tokenCache.has(cacheKey)) {
                return tokenCache.get(cacheKey);
            }

            leakCount += 1;
            const masked = this.maskMatch(match, 'CUSTOM', 'custom');
            tokenCache.set(cacheKey, masked);
            return masked;
        };

        const maskedPlain = plainResult.replace(customRegex, (match) => {
            return getTokenForMatch(match).plain;
        });

        customRegex.lastIndex = 0;

        const maskedHtml = htmlResult.replace(customRegex, (match) => {
            return getTokenForMatch(match).html;
        });

        return {
            plainResult: maskedPlain,
            htmlResult: maskedHtml,
            leakCount
        };
    }

    process(rawText, activeFilters, customKeywordsString = '') {
        if (!rawText) {
            this.clearSession();
            return { plainText: '', htmlText: '', leakCount: 0 };
        }

        this.clearSession();

        let plainResult = rawText;
        let htmlResult = this.escapeHtml(rawText);
        let totalLeaks = 0;

        for (const rule of Object.values(this.rules)) {
            if (!activeFilters[rule.id]) continue;

            const replaced = this.applyRuleReplacements(plainResult, htmlResult, rule);
            plainResult = replaced.plainResult;
            htmlResult = replaced.htmlResult;
            totalLeaks += replaced.leakCount;
        }

        const customResult = this.applyCustomKeywords(
            plainResult,
            htmlResult,
            customKeywordsString
        );

        return {
            plainText: customResult.plainResult,
            htmlText: customResult.htmlResult,
            leakCount: totalLeaks + customResult.leakCount
        };
    }

    unmask(textWithTags) {
        if (!textWithTags) {
            return '';
        }

        return textWithTags.replace(TOKEN_PATTERN, (fullMatch, tokenBody) => {
            const token = `[${tokenBody}]`;
            return this.sessionMap.has(token) ? this.sessionMap.get(token) : fullMatch;
        });
    }

    loadSession(sessionEntries) {
        this.clearSession();

        if (!sessionEntries) {
            return;
        }

        sessionEntries.forEach(([token, value]) => {
            this.sessionMap.set(token, value);
        });
    }
}

const tableMaskEngine = new TableMaskEngine();

if (typeof window !== 'undefined') {
    window.TableMaskEngine = tableMaskEngine;
} else if (typeof self !== 'undefined') {
    self.TableMaskEngine = tableMaskEngine;
}
