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
    loggedIn: 'Proceed to payment',
    proActive: 'Pro Lifetime Activated 💎'
};

const DEBOUNCE_MS = 175;
const CUSTOM_KEYWORDS_STORAGE_KEY = 'tablemask_custom_keywords';

// Paddle v3 Billing
const PADDLE_CONFIG = {
    environment: 'production',
    token: 'live_da6aeff36419dd0a5148263e095'
};

let currentUser = null;
let pendingCheckout = false;
let isPaddleReady = false;

function initPaddleV3() {
    if (typeof Paddle !== 'undefined') {
        Paddle.Environment.set(PADDLE_CONFIG.environment);
        Paddle.Initialize({
            token: PADDLE_CONFIG.token,
            eventCallback: (event) => {
                if (event.name === 'checkout.completed') {
                    handleCheckoutSuccess();
                }
            }
        });
        isPaddleReady = true;
        console.log('⚡ Paddle v3 успешно запущен и готов.');
    }
}

function handleCheckoutSuccess() {
    if (currentUser) {
        currentUser.isPro = true;
    }

    updateAllCheckoutButtons(currentUser);
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

    // Default to lifetime plan for pending checkouts
    const lifetimeBtn = document.getElementById('lifetime-checkout-btn');
    const defaultPriceId = lifetimeBtn?.dataset.priceId || 'pri_01ktvj00d98wdsegce61r7qe3v';
    openPaddleCheckout(user, defaultPriceId);
}

function openPaddleCheckout(user, priceId) {
    if (!isPaddleReady) {
        console.log('Paddle ещё загружается, повтор через 200мс...');
        setTimeout(() => openPaddleCheckout(user, priceId), 200);
        return;
    }

    Paddle.Checkout.open({
        settings: {
            displayMode: 'overlay',
            theme: 'light',
            locale: 'en'
        },
        items: [{ priceId: priceId, quantity: 1 }],
        customer: { email: user.email },
        customData: { uid: user.uid }
    });
}

function isProUser() {
    return currentUser?.isPro === true;
}

function openTableMaskPaywall() {
    const modal = document.getElementById('paywall-modal');
    if (!modal) return;
    modal.classList.add('is-open');
    document.body.style.overflow = 'hidden';
}

function closePaywallModal() {
    const modal = document.getElementById('paywall-modal');
    if (!modal) return;
    modal.classList.remove('is-open');
    document.body.style.overflow = '';
}

function initPaywallModal() {
    const modal = document.getElementById('paywall-modal');
    if (!modal) return;

    const closeBtn = modal.querySelector('.paywall-close');
    const backdrop = modal.querySelector('.paywall-backdrop');
    const ctaBtn = modal.querySelector('.paywall-cta');

    const close = () => closePaywallModal();

    closeBtn?.addEventListener('click', close);
    backdrop?.addEventListener('click', close);
    ctaBtn?.addEventListener('click', () => {
        close();
        document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' });
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && modal.classList.contains('is-open')) {
            close();
        }
    });
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
        const signInBtn = document.createElement('button');
        signInBtn.type = 'button';
        signInBtn.className = 'sign-in-btn';
        signInBtn.textContent = 'Sign in';
        signInBtn.addEventListener('click', async () => {
            try {
                await loginWithGoogle();
            } catch (error) {
                console.error('Sign in failed:', error);
            }
        });
        authZone.appendChild(signInBtn);
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

function updatePricingRestoreLinks(user) {
    const showLink = !user;

    document.querySelectorAll('.js-pricing-sign-in').forEach((link) => {
        link.hidden = !showLink;
    });
}

async function handlePricingSignIn() {
    try {
        await loginWithGoogle();
    } catch (error) {
        console.error('Sign in failed:', error);
    }
}

function initPricingRestoreLinks() {
    document.querySelectorAll('.js-pricing-sign-in').forEach((link) => {
        link.addEventListener('click', handlePricingSignIn);
    });
}

function updateCheckoutButton(checkoutBtn, user) {
    if (!checkoutBtn) {
        return;
    }

    if (user?.isPro === true) {
        checkoutBtn.textContent = CHECKOUT_LABELS.proActive;
        checkoutBtn.disabled = true;
        checkoutBtn.classList.add('is-pro-active');
        return;
    }

    const defaultLabel = checkoutBtn.dataset.labelDefault || 'Get Access';

    checkoutBtn.disabled = false;
    checkoutBtn.classList.remove('is-pro-active');
    checkoutBtn.textContent = user
        ? CHECKOUT_LABELS.loggedIn
        : defaultLabel;
}

function initAuth(onUserReady) {
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
        updateAllCheckoutButtons(user);
        updatePricingRestoreLinks(user);
        maybeOpenPendingCheckout(user);
        onUserReady?.(user);
    });
}

function updateAllCheckoutButtons(user) {
    document.querySelectorAll('.checkout-btn').forEach(btn => {
        updateCheckoutButton(btn, user);
    });
}

function initCheckoutButtons() {
    document.querySelectorAll('.checkout-btn').forEach(btn => {
        btn.addEventListener('click', async (event) => {
            const priceId = event.target.dataset.priceId;
            if (!priceId) return;

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

                openPaddleCheckout(currentUser, priceId);
            } catch (error) {
                console.error('Checkout failed:', error);
            }
        });
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
    tabUnmask.addEventListener('click', () => {
        if (!isProUser()) {
            openTableMaskPaywall();
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

        if (!isProUser()) {
            openTableMaskPaywall();
            return;
        }

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
    initPaywallModal();
    initPricingRestoreLinks();
    initCookbookReader();

    initCheckoutButtons();
    initAuth(() => {
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
