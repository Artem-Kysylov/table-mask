/**
 * TableMask UI Controller — Syntax Labs
 * Обработка событий интерфейса, синхронизация ввода/вывода и копирование
 */

import { loginWithGoogle, logoutUser, onAuthChange } from './auth.js';

const COPY_LABELS = {
    anonymize: 'Copy Anonymized',
    unmask: 'Copy Unmasked'
};

const DEBOUNCE_MS = 175;
const CUSTOM_KEYWORDS_STORAGE_KEY = 'tablemask_custom_keywords';

let currentUser = null;

function isSafeImageUrl(url) {
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch {
        return false;
    }
}

function renderAuthZone(user) {
    const authZone = document.getElementById('auth-zone');

    if (!authZone) {
        return;
    }

    authZone.replaceChildren();

    if (!user) {
        return;
    }

    const profile = document.createElement('div');
    profile.className = 'user-profile';

    const userInfo = document.createElement('div');
    userInfo.className = 'user-info';

    if (user.photoURL && isSafeImageUrl(user.photoURL)) {
        const avatar = document.createElement('img');
        avatar.className = 'user-avatar';
        avatar.width = 32;
        avatar.height = 32;
        avatar.alt = '';
        avatar.referrerPolicy = 'no-referrer';
        avatar.src = user.photoURL;
        avatar.addEventListener('error', () => avatar.remove());
        userInfo.appendChild(avatar);
    }

    const userName = document.createElement('span');
    userName.className = 'user-name';
    userName.textContent = user.displayName || user.email || 'User';
    userInfo.appendChild(userName);

    const signOutLink = document.createElement('a');
    signOutLink.href = '#';
    signOutLink.className = 'sign-out-link';
    signOutLink.textContent = 'Sign out';
    signOutLink.addEventListener('click', async (event) => {
        event.preventDefault();

        try {
            await logoutUser();
        } catch (error) {
            console.error('Sign out failed:', error);
        }
    });
    userInfo.appendChild(signOutLink);

    profile.appendChild(userInfo);
    authZone.appendChild(profile);
}

function initAuth(checkoutBtn) {
    onAuthChange((user) => {
        currentUser = user;
        renderAuthZone(user);
    });

    if (!checkoutBtn) {
        return;
    }

    checkoutBtn.addEventListener('click', async () => {
        try {
            if (!currentUser) {
                const user = await loginWithGoogle();

                if (user) {
                    console.log(`Proceeding to checkout for ${user.email}`);
                }

                return;
            }

            console.log(`Proceeding to checkout for ${currentUser.email}`);
        } catch (error) {
            console.error('Authentication failed:', error);
        }
    });
}

export function initUI(engine) {
    const maskWorker = new Worker('worker.js');

    const dataInput = document.getElementById('data-input');
    const dataOutput = document.getElementById('data-output');
    const clearBtn = document.getElementById('clear-btn');
    const copyBtn = document.getElementById('copy-btn');
    const statsCounter = document.getElementById('stats-counter');
    const loadingIndicator = document.getElementById('loading-indicator');
    const customKeywordsInput = document.getElementById('custom-keywords');
    const tabAnonymize = document.getElementById('tab-anonymize');
    const tabUnmask = document.getElementById('tab-unmask');
    const unmaskZone = document.getElementById('unmask-zone');
    const aiResponseInput = document.getElementById('ai-response-input');
    const unmaskDisplay = document.getElementById('unmask-display');
    const checkoutBtn = document.querySelector('.pro-card .card-btn');

    const filters = {
        email: document.getElementById('filter-email'),
        phone: document.getElementById('filter-phone'),
        card: document.getElementById('filter-card'),
        ip: document.getElementById('filter-ip'),
        name: document.getElementById('filter-name')
    };

    let maskedPlainCache = '';
    let unmaskedPlainCache = '';
    let activeTab = 'anonymize';
    let debounceTimer = null;
    let latestRequestId = 0;

    function getActiveFilters() {
        return {
            email: filters.email.checked,
            phone: filters.phone.checked,
            card: filters.card.checked,
            ip: filters.ip.checked,
            name: filters.name.checked
        };
    }

    function showLoading() {
        loadingIndicator.style.display = 'inline';
    }

    function hideLoading() {
        loadingIndicator.style.display = 'none';
    }

    function updateCopyButtonLabel() {
        copyBtn.textContent = COPY_LABELS[activeTab];
    }

    function switchTab(tabName) {
        activeTab = tabName;
        const isAnonymize = tabName === 'anonymize';

        tabAnonymize.classList.toggle('active', isAnonymize);
        tabUnmask.classList.toggle('active', !isAnonymize);
        dataOutput.classList.toggle('is-active', isAnonymize);
        unmaskZone.classList.toggle('is-active', !isAnonymize);
        updateCopyButtonLabel();
    }

    function applyProcessingResult(result) {
        engine.loadSession(result.sessionMap);
        dataOutput.innerHTML = result.htmlText;
        maskedPlainCache = result.plainText;
        statsCounter.textContent = `${result.leakCount} leaks blocked`;

        if (aiResponseInput.value) {
            handleUnmasking();
        }
    }

    function resetProcessingOutput() {
        engine.clearSession();
        dataOutput.innerHTML = '';
        maskedPlainCache = '';
        statsCounter.textContent = '0 leaks blocked';
        hideLoading();

        if (aiResponseInput.value) {
            handleUnmasking();
        }
    }

    function scheduleProcessing() {
        clearTimeout(debounceTimer);

        debounceTimer = setTimeout(() => {
            const rawText = dataInput.value;
            const activeFilters = getActiveFilters();
            const customKeywords = customKeywordsInput.value;

            if (!rawText) {
                resetProcessingOutput();
                return;
            }

            latestRequestId += 1;
            showLoading();

            maskWorker.postMessage({
                requestId: latestRequestId,
                rawText,
                activeFilters,
                customKeywords
            });
        }, DEBOUNCE_MS);
    }

    function handleCustomKeywordsInput() {
        localStorage.setItem(CUSTOM_KEYWORDS_STORAGE_KEY, customKeywordsInput.value);
        scheduleProcessing();
    }

    function handleUnmasking() {
        const restoredText = engine.unmask(aiResponseInput.value);
        unmaskDisplay.textContent = restoredText;
        unmaskedPlainCache = restoredText;
    }

    function getCopyText() {
        return activeTab === 'unmask' ? unmaskedPlainCache : maskedPlainCache;
    }

    maskWorker.onmessage = (event) => {
        const { requestId, plainText, htmlText, leakCount, sessionMap } = event.data;

        if (requestId !== latestRequestId) {
            return;
        }

        hideLoading();
        applyProcessingResult({
            plainText,
            htmlText,
            leakCount,
            sessionMap
        });
    };

    maskWorker.onerror = (error) => {
        console.error('Mask worker failed:', error);
        hideLoading();
    };

    dataInput.addEventListener('input', scheduleProcessing);
    customKeywordsInput.addEventListener('input', handleCustomKeywordsInput);

    Object.values(filters).forEach((checkbox) => {
        checkbox.addEventListener('change', scheduleProcessing);
    });

    tabAnonymize.addEventListener('click', () => switchTab('anonymize'));
    tabUnmask.addEventListener('click', () => switchTab('unmask'));
    aiResponseInput.addEventListener('input', handleUnmasking);

    clearBtn.addEventListener('click', () => {
        clearTimeout(debounceTimer);
        latestRequestId += 1;
        engine.clearSession();
        dataInput.value = '';
        customKeywordsInput.value = '';
        localStorage.removeItem(CUSTOM_KEYWORDS_STORAGE_KEY);
        aiResponseInput.value = '';
        dataOutput.innerHTML = '';
        unmaskDisplay.textContent = '';
        maskedPlainCache = '';
        unmaskedPlainCache = '';
        statsCounter.textContent = '0 leaks blocked';
        hideLoading();
        dataInput.focus();
    });

    copyBtn.addEventListener('click', async () => {
        const textToCopy = getCopyText();
        if (!textToCopy) return;

        try {
            await navigator.clipboard.writeText(textToCopy);

            const originalText = copyBtn.textContent;
            copyBtn.textContent = 'Copied! ✓';
            copyBtn.style.backgroundColor = 'var(--accent-lime)';
            copyBtn.style.color = '#111113';
            copyBtn.style.fontWeight = '600';

            setTimeout(() => {
                copyBtn.textContent = originalText;
                copyBtn.style.backgroundColor = '';
                copyBtn.style.color = '';
                copyBtn.style.fontWeight = '';
            }, 1500);
        } catch (err) {
            console.error('Failed to copy text: ', err);
            alert('Could not copy text. Please try again.');
        }
    });

    const savedKeywords = localStorage.getItem(CUSTOM_KEYWORDS_STORAGE_KEY);
    if (savedKeywords) {
        customKeywordsInput.value = savedKeywords;
        scheduleProcessing();
    }

    updateCopyButtonLabel();
    initCookbookReader();
    initAuth(checkoutBtn);
}

function initCookbookReader() {
    const guideCards = document.querySelectorAll('.guide-card');
    const readerModal = document.getElementById('reader-modal');
    const readerBody = document.getElementById('reader-body');
    const closeReaderBtn = document.getElementById('close-reader');
    const modalBackdrop = readerModal?.querySelector('.modal-backdrop');

    if (!readerModal || !readerBody || !closeReaderBtn || !modalBackdrop) {
        return;
    }

    function openReader(contentHtml) {
        readerBody.innerHTML = contentHtml;
        readerModal.classList.add('is-open');
        document.body.style.overflow = 'hidden';
    }

    function closeReader() {
        readerModal.classList.remove('is-open');
        readerBody.innerHTML = '';
        document.body.style.overflow = '';
    }

    guideCards.forEach((card) => {
        card.addEventListener('click', () => {
            const hiddenContent = card.querySelector('.guide-content-hidden');

            if (!hiddenContent) {
                return;
            }

            openReader(hiddenContent.innerHTML);
        });
    });

    closeReaderBtn.addEventListener('click', closeReader);
    modalBackdrop.addEventListener('click', closeReader);

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && readerModal.classList.contains('is-open')) {
            closeReader();
        }
    });
}
