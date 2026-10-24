# Third-party notices

## Comment system dependencies

The comment UI, persistence, moderation and migration are implemented in this project.
Server-side HTML sanitization uses [sanitize-html](https://github.com/apostrophecms/sanitize-html) (MIT).
Device labels use [UAParser.js v1](https://github.com/faisalman/ua-parser-js/tree/1.0.41) (MIT), pinned to the v1 major line.
Optional SMTP notifications use [Nodemailer](https://nodemailer.com/) (MIT-0).
Original licenses are retained in their npm packages. Twikoo is no longer a runtime dependency.

## 得意黑 Smiley Sans

全站字体使用 [atelier-anchor/smiley-sans v2.0.1](https://github.com/atelier-anchor/smiley-sans/releases/tag/v2.0.1)
官方 WOFF2 文件，本地路径为 `public/fonts/smiley-sans.woff2`。
Copyright 2022–2024 atelierAnchor。依照 SIL Open Font License 1.1 分发，
完整许可证保留在 `public/fonts/OFL-SmileySans.txt`。

## spring_blogs visual and interaction reference

Public-facing layout and motion were rebuilt for Astro with reference to
[RRTiamo/spring_blogs](https://github.com/RRTiamo/spring_blogs), commit
`a57b66189c14c80f75920960028768a6edd0926b`. Reference-specific private-life
modules, personal text and media are excluded. The reference repository does
not provide a license; its source and personal assets are not bundled here.

## Jost

The locally served Jost regular font is Copyright 2020 The Jost Project Authors.
It is distributed under the SIL Open Font License 1.1; the complete license is
included at `public/fonts/Jost-OFL.txt`.

## Lenis

Lenis is installed from its npm package under the MIT license. Its original
license remains in the installed package.

## scaffold-master visual design reference

The admin's warm pearl visual language and motion vocabulary are adapted from
[scaffold-master](https://github.com/wbr664393425-lgtm/scaffold-master), reference
commit `577079e9a347555fadddd3865fc0bbcdb00d9fb4`.

MIT License

Copyright (c) 2026 wbr664393425-lgtm

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Liquid Glass Web / liquid-glass

Navigation refraction and restrained light/press feedback are adapted from
[xiaofangstudio/liquid-glass-web](https://github.com/xiaofangstudio/liquid-glass-web),
commit `3094add905e60ee5aeb45e806751beb94425dd73`, which identifies its code as MIT
(reference rechecked on 2026-10-24).
Its refraction engine credits [shuding/liquid-glass](https://github.com/shuding/liquid-glass).
The navigation uses the reference fragment and normalization constants, filter chain,
independent button surfaces, press/stretch feedback, 500ms spring return, 1400ms
volumetric light and neighboring illumination. Texture caching and persistent Astro
navigation preserve the material across page changes. The existing CSS-pixel capsule
variant remains available for other components. Reference photos and freely draggable
floating lenses are not bundled.

MIT License

Copyright (c) 2025 Shu Ding

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## GSAP license

GSAP and Flip are runtime dependencies served from the installed npm package.
They use GSAP's [Standard No Charge License](https://gsap.com/standard-license/),
not this project's MIT license. Original package and distribution notices remain intact.
