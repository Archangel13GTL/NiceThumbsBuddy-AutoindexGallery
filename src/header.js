// ==UserScript==
// @name         NiceThumbsBuddy — Autoindex Gallery
// @namespace    archangel.nicethumbsbuddy
// @version      2.6.0
// @description  Transform bare Apache/Nginx directory listings into a rich gallery with smart folders.
// @author       Archangel13GTL
// @license      MIT
// @run-at       document-end
// @grant        none
// @match        *://*/wp-content/uploads/*
// @match        *://*/wp-content/*/*
// @match        *://*/images/*
// @match        *://*/pictures/*
// @match        *://*/photos/*
// @match        *://*/gallery/*
// @match        *://*/uploads/*
// @match        *://*/files/*
// @match        *://*/*?C=*
// @match        *://*/*?O=*
// @include      /^https?:\/\/[^\/]+\/(?:[^?#]*\/)?(?:index\.html?)?$/
// ==/UserScript==

(function(){
  'use strict';
