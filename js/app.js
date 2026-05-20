/**
 * TableMask App — Syntax Labs
 * Точка входа: инициализация движка и UI
 */

import { initUI } from './ui-controller.js';

document.addEventListener('DOMContentLoaded', () => {
    initUI(window.TableMaskEngine);
});
