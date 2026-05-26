/**
 * TableMask UI Controller — Syntax Labs
 * Обработка событий интерфейса, синхронизация ввода/вывода и копирование
 */

import { loginWithGoogle, logoutUser, onAuthChange, syncUserInDatabase } from './auth.js';

const COPY_LABELS = {
    anonymize: 'Copy Anonymized',
    unmask: 'Copy Unmasked'
};

const CHECKOUT_LABELS = {
    loggedOut: 'Get Lifetime Access',
    loggedIn: 'Proceed to payment'
};

const DEBOUNCE_MS = 175;
const FREE_TIER_CHAR_LIMIT = 1000;
const CUSTOM_KEYWORDS_STORAGE_KEY = 'tablemask_custom_keywords';
const PRO_PAYWALL_MESSAGE = 'Reverse Mapping is a Pro feature. Please upgrade to Founder Lifetime to unlock.';
const FREE_TIER_LIMIT_MESSAGE = 'Free tier limit reached (1,000 characters). Please upgrade to Pro for unlimited bulk processing.';

// Paddle v3 Billing — замени перед публикацией
const PADDLE_CONFIG = {
    environment: 'sandbox',
    token: 'test_840374f72bf9a6cf51704e73527',
    priceId: 'pri_01ksj4y39k1ehghtfhekewhdfk'
};

let currentUser = null;
let pendingCheckout = false;
let isPaddleReady = false;

function initPaddleV3() {
    if (typeof Paddle !== 'undefined') {
        Paddle.Environment.set(PADDLE_CONFIG.environment);
        Paddle.Initialize({ token: PADDLE_CONFIG.token });
        isPaddleReady = true;
        console.log('⚡ Paddle v3 успешно запущен и готов.');
    }
}

const waitForPaddle = setInterval(() => {
    if (typeof Paddle !== 'undefined') {
        initPaddleV3();
        clearInterval(waitForPaddle);
    }
}, 100);

setTimeout(() => clearInterval(waitForPaddle), 5000);

function maybeOpenPendingCheckout(user) {
    if (!pendingCheckout) {
        return;
    }

    pendingCheckout = false;

    if (!user || user.isPro) {
        return;
    }

    openPaddleCheckout(user);
}

function openPaddleCheckout(user) {
    if (!isPaddleReady) {
        console.log('Паддл ещё заряжается, повтор через 200мс...');
        setTimeout(() => openPaddleCheckout(user), 200);
        return;
    }

    Paddle.Checkout.open({
        settings: {
            displayMode: 'overlay',
            theme: 'dark',
            locale: 'en'
        },
        items: [{ priceId: PADDLE_CONFIG.priceId, quantity: 1 }],
        customer: { email: user.email },
        customData: { uid: user.uid }
    });
}

function isProUser() {
    return currentUser?.isPro === true;
}

function showProFeatureModal(message) {
    let modal = document.getElementById('pro-feature-modal');

    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'pro-feature-modal';
        modal.className = 'reader-modal';
        modal.innerHTML = `
            <div class="modal-backdrop"></div>
            <div class="modal-content" style="max-width: 480px; text-align: center;">
                <button class="close-btn" type="button">✕ Close</button>
                <p id="pro-modal-message" style="clear: both; padding-top: 24px; color: var(--text-main); font-size: 16px; line-height: 1.6;"></p>
                <a href="#pricing" class="btn btn-primary" style="display: inline-block; margin-top: 20px; text-decoration: none;">View Pricing</a>
            </div>
        `;
        document.body.appendChild(modal);

        const closeModal = () => {
            modal.classList.remove('is-open');
            document.body.style.overflow = '';
        };

        modal.querySelector('.close-btn').addEventListener('click', closeModal);
        modal.querySelector('.modal-backdrop').addEventListener('click', closeModal);
        modal.querySelector('a[href="#pricing"]').addEventListener('click', closeModal);

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && modal.classList.contains('is-open')) {
                closeModal();
            }
        });
    }

    modal.querySelector('#pro-modal-message').textContent = message;
    modal.classList.add('is-open');
    document.body.style.overflow = 'hidden';
}

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

function updateCheckoutButton(checkoutBtn, user) {
    if (!checkoutBtn) {
        return;
    }

    if (user?.isPro === true) {
        checkoutBtn.textContent = 'You have Active Pro';
        checkoutBtn.disabled = true;
        checkoutBtn.classList.add('is-pro-active');
        return;
    }

    checkoutBtn.disabled = false;
    checkoutBtn.classList.remove('is-pro-active');
    checkoutBtn.textContent = user
        ? CHECKOUT_LABELS.loggedIn
        : CHECKOUT_LABELS.loggedOut;
}

function initAuth(checkoutBtn, onUserReady) {
    onAuthChange(async (user) => {
        if (user) {
            try {
                const dbUser = await syncUserInDatabase(user);
                user.isPro = dbUser ? dbUser.isPro : false;
            } catch (error) {
                console.error('Failed to sync user profile:', error);
                user.isPro = false;
            }
        }

        currentUser = user;
        renderAuthZone(user);
        updateCheckoutButton(checkoutBtn, user);
        maybeOpenPendingCheckout(user);
        onUserReady?.(user);
    });

    if (!checkoutBtn) {
        return;
    }

    checkoutBtn.addEventListener('click', async () => {
        try {
            if (currentUser?.isPro) {
                return;
            }

            if (!currentUser) {
                pendingCheckout = true;

                try {
                    await loginWithGoogle();
                } catch (error) {
                    pendingCheckout = false;
                    throw error;
                }

                return;
            }

            openPaddleCheckout(currentUser);
        } catch (error) {
            console.error('Checkout failed:', error);
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

    function showFreeTierLimitNotice() {
        hideLoading();
        engine.clearSession();
        dataOutput.replaceChildren();

        const notice = document.createElement('p');
        notice.textContent = FREE_TIER_LIMIT_MESSAGE;
        notice.style.cssText = [
            'color: var(--accent-amber)',
            'padding: 16px',
            'margin: 0',
            'font-size: 14px',
            'line-height: 1.5',
            'border: 1px solid var(--border-color)',
            'border-radius: 8px',
            'background: var(--accent-amber-dim)'
        ].join('; ');
        dataOutput.appendChild(notice);
        maskedPlainCache = '';
        statsCounter.textContent = '0 leaks blocked';
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

            if (!isProUser() && rawText.length > FREE_TIER_CHAR_LIMIT) {
                latestRequestId += 1;
                showFreeTierLimitNotice();
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
    tabUnmask.addEventListener('click', () => {
        if (!isProUser()) {
            showProFeatureModal(PRO_PAYWALL_MESSAGE);
            return;
        }

        switchTab('unmask');
    });
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
    initAuth(checkoutBtn, () => {
        if (dataInput.value) {
            scheduleProcessing();
        }
    });
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
