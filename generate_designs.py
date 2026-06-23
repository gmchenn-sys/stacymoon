#!/usr/bin/env python3
"""
Stacy Moon 品牌设计图生成脚本
根据视觉指南方案A（潮汐原版）生成：
- 小红书配图（3张/套 × 2套 = 6张）
- 发布会招募海报（2版 × 2套 = 4张）
"""

import os
import math
from PIL import Image, ImageDraw, ImageFont, ImageFilter

# ── 品牌色系（方案A · 潮汐原版）──
BG_DARK = (10, 10, 15)
ORANGE = (249, 115, 22)
ORANGE_LIGHT = (254, 243, 199)  # 浅金
TEXT_MAIN = (226, 226, 232)
TEXT_GRAY = (136, 136, 160)
CARD_BG = (18, 18, 26)
CARD_BORDER = (255, 255, 255, 15)  # rgba

# 渐变颜色
GRAD_TOP = (249, 115, 22, 50)      # 橙色半透明
GRAD_BOTTOM = (254, 243, 199, 20)  # 浅金半透明

OUTPUT_DIR = "/Users/apple/Desktop/vibecoding项目/黑客松/2026.5 stacy moon/output/images"

# ── 字体加载 ──
def load_fonts():
    fonts = {}
    try:
        fonts['bold'] = ImageFont.truetype("/System/Library/Fonts/STHeiti Light.ttc", 48)
        fonts['medium'] = ImageFont.truetype("/System/Library/Fonts/STHeiti Light.ttc", 32)
        fonts['regular'] = ImageFont.truetype("/System/Library/Fonts/STHeiti Light.ttc", 24)
        fonts['small'] = ImageFont.truetype("/System/Library/Fonts/STHeiti Light.ttc", 18)
        fonts['tiny'] = ImageFont.truetype("/System/Library/Fonts/STHeiti Light.ttc", 14)
        # 英文
        fonts['en_regular'] = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 16)
        fonts['en_small'] = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 12)
    except:
        # fallback
        fonts['bold'] = ImageFont.load_default()
        fonts['medium'] = ImageFont.load_default()
        fonts['regular'] = ImageFont.load_default()
        fonts['small'] = ImageFont.load_default()
        fonts['tiny'] = ImageFont.load_default()
        fonts['en_regular'] = ImageFont.load_default()
        fonts['en_small'] = ImageFont.load_default()
    return fonts

FONTS = load_fonts()

# ── 工具函数 ──
def create_canvas(w, h, bg_color=BG_DARK):
    """创建深色背景画布"""
    img = Image.new('RGBA', (w, h), bg_color + (255,) if len(bg_color) == 3 else bg_color)
    return img

def add_gradient_overlay(draw, w, h):
    """添加从顶部到底部的渐变光晕"""
    for y in range(h):
        ratio = y / h
        # 顶部橙色光晕，到底部渐淡
        alpha = int(max(0, 30 * (1 - ratio * 2)))
        if alpha > 0:
            draw.rectangle([0, y, w, y+1], fill=(249, 115, 22, alpha))

def add_moon_element(draw, w, h, cx=None, cy=None, radius=60, alpha=30):
    """添加月相元素（半透明圆）"""
    cx = cx or w - 100
    cy = cy or 80
    # 大月晕
    for r in range(int(radius * 1.5), radius, -1):
        a = int(alpha * (1 - r / (radius * 1.5)))
        draw.ellipse([cx-r, cy-r, cx+r, cy+r], fill=(249, 115, 22, a // 4))
    # 月亮主体
    draw.ellipse([cx-radius, cy-radius, cx+radius, cy+radius], fill=(249, 115, 22, alpha))
    # 月牙效果
    draw.ellipse([cx-radius//2, cy-radius, cx+radius//2, cy+radius], fill=BG_DARK + (255,))

def draw_text_centered(draw, text, y, font_key='medium', color=TEXT_MAIN, w=None, max_width=None):
    """居中绘制文本"""
    if w is None:
        from PIL import Image
        w = 1080  # 默认小红书宽度
    font = FONTS[font_key]
    
    # 处理换行
    lines = text.split('\n')
    total_h = 0
    line_h = 0
    for line in lines:
        bbox = draw.textbbox((0, 0), line, font=font)
        lh = bbox[3] - bbox[1] + 8
        line_h = max(line_h, lh)
        total_h += lh
    
    current_y = y - total_h // 2
    
    for line in lines:
        bbox = draw.textbbox((0, 0), line, font=font)
        tw = bbox[2] - bbox[0]
        x = (w - tw) // 2
        draw.text((x, current_y), line, font=font, fill=color)
        current_y += line_h

def draw_multiline(draw, text, x, y, font_key='regular', color=TEXT_MAIN, max_width=800, line_spacing=1.5, align='left'):
    """多行文本绘制，自动换行"""
    font = FONTS[font_key]
    lines = []
    
    for paragraph in text.split('\n'):
        words = list(paragraph)  # 中文字符
        current_line = ''
        for ch in words:
            test_line = current_line + ch
            bbox = draw.textbbox((0, 0), test_line, font=font)
            tw = bbox[2] - bbox[0]
            if tw > max_width and current_line:
                lines.append(current_line)
                current_line = ch
            else:
                current_line = test_line
        if current_line:
            lines.append(current_line)
    
    bbox_first = draw.textbbox((0, 0), '测', font=font)
    line_h = (bbox_first[3] - bbox_first[1]) * line_spacing
    
    current_y = y
    for line in lines:
        bbox = draw.textbbox((0, 0), line, font=font)
        tw = bbox[2] - bbox[0]
        
        if align == 'center':
            lx = x + (max_width - tw) // 2
        elif align == 'right':
            lx = x + max_width - tw
        else:
            lx = x
        
        draw.text((lx, current_y), line, font=font, fill=color)
        current_y += line_h
    
    return current_y - y

def draw_bottom_bar(draw, w, h):
    """底部品牌标识条"""
    bar_y = h - 60
    # 细线
    draw.rectangle([40, bar_y, w-40, bar_y+1], fill=(249, 115, 22, 60))
    # 品牌名
    draw.text((40, bar_y + 12), "Stacy Moon", font=FONTS['en_small'], fill=(249, 115, 22, 180))
    draw.text((w - 40 - 100, bar_y + 12), "关注公众号 · 回复「月亮」", font=FONTS['tiny'], fill=TEXT_GRAY)

def draw_qr_placeholder(draw, x, y, size=80):
    """二维码占位区域"""
    # 白色方块加圆角
    draw.rounded_rectangle([x, y, x+size, y+size], radius=8, fill=(255, 255, 255, 20), outline=(255, 255, 255, 40), width=1)
    # 中心文字
    draw.text((x+size//2-20, y+size//2-8), "QR", font=FONTS['tiny'], fill=(255, 255, 255, 60))
    draw.text((x+size//2-28, y+size//2+10), "公众号", font=FONTS['tiny'], fill=(255, 255, 255, 60))

# ═══════════════════════════════════════════
#  小红书配图 - 文案1（内测招募 · 通用版）
# ═══════════════════════════════════════════

def make_xhs_set1():
    """『给妈妈们』小红书配图3张"""
    W, H = 1080, 1440  # 3:4 小红书竖版
    
    # ── 图1：封面 ──
    img = create_canvas(W, H)
    draw = ImageDraw.Draw(img)
    add_gradient_overlay(draw, W, H)
    add_moon_element(draw, W, H, cx=W//2, cy=280, radius=100, alpha=25)
    
    # 主标题
    draw_text_centered(draw, "给正在经历", 340, 'bold', ORANGE_LIGHT, W)
    draw_text_centered(draw, "潮热、睡不好、情绪起伏", 410, 'bold', ORANGE, W)
    draw_text_centered(draw, "的妈妈们", 480, 'bold', ORANGE_LIGHT, W)
    
    # 分隔线
    draw.rectangle([W//2-60, 530, W//2+60, 532], fill=ORANGE)
    
    # 副标题
    draw_text_centered(draw, "我们想邀请你", 590, 'medium', TEXT_MAIN, W)
    draw_text_centered(draw, "加入一次内测", 640, 'medium', TEXT_MAIN, W)
    
    # 底部品牌
    draw_bottom_bar(draw, W, H)
    draw_qr_placeholder(draw, W-120, H-170, 80)
    
    img.save(f"{OUTPUT_DIR}/xiaohongshu/set1-cover.png")
    print("✅ 小红书 文案1-图1 封面")
    
    # ── 图2：痛点 ──
    img2 = create_canvas(W, H)
    draw2 = ImageDraw.Draw(img2)
    add_gradient_overlay(draw2, W, H)
    
    # 小标签
    draw2.text((80, 200), "如果妈妈最近常常：", font=FONTS['small'], fill=TEXT_GRAY)
    
    # 痛点列表
    pain_points = [
        ("✦", "突然发热出汗"),
        ("✦", "半夜醒来睡不着"),
        ("✦", "情绪起伏却说不清原因"),
    ]
    y_start = 280
    for icon, text in pain_points:
        draw2.text((120, y_start), f"{icon}  {text}", font=FONTS['medium'], fill=TEXT_MAIN)
        y_start += 80
    
    # 强调
    draw2.rectangle([120, y_start+20, 400, y_start+22], fill=ORANGE)
    draw2.text((120, y_start+40), "这不一定是她「想太多」", font=FONTS['medium'], fill=ORANGE)
    
    # 底部
    draw_bottom_bar(draw2, W, H)
    draw_qr_placeholder(draw2, W-120, H-170, 80)
    
    img2.save(f"{OUTPUT_DIR}/xiaohongshu/set1-pain.png")
    print("✅ 小红书 文案1-图2 痛点")
    
    # ── 图3：邀请 ──
    img3 = create_canvas(W, H)
    draw3 = ImageDraw.Draw(img3)
    add_gradient_overlay(draw3, W, H)
    add_moon_element(draw3, W, H, cx=W-100, cy=200, radius=70, alpha=20)
    
    draw3.text((80, 200), "我们正在做一个", font=FONTS['regular'], fill=TEXT_GRAY)
    draw3.text((80, 240), "更年期陪伴工具", font=FONTS['bold'], fill=ORANGE)
    
    features = [
        "记录身体变化",
        "整理感受和症状",
        "帮助家人更自然地理解彼此",
    ]
    y = 340
    for f in features:
        draw3.rounded_rectangle([100, y, W-100, y+50], radius=25, fill=CARD_BG, outline=(249, 115, 22, 80), width=1)
        draw3.text((130, y+12), f, font=FONTS['regular'], fill=TEXT_MAIN)
        y += 65
    
    # CTA
    draw3.rectangle([W//4, y+30, W*3//4, y+80], fill=ORANGE)
    draw3.text((W//2-90, y+42), "关注公众号 · 回复【月亮】", font=FONTS['small'], fill=(0, 0, 0))
    
    draw_bottom_bar(draw3, W, H)
    
    img3.save(f"{OUTPUT_DIR}/xiaohongshu/set1-invite.png")
    print("✅ 小红书 文案1-图3 邀请")


# ═══════════════════════════════════════════
#  小红书配图 - 文案2（围绝经期 · 女性本人版）
# ═══════════════════════════════════════════

def make_xhs_set2():
    """『给围绝经期女性』小红书配图3张"""
    W, H = 1080, 1440
    
    # ── 图1：封面 ──
    img = create_canvas(W, H)
    draw = ImageDraw.Draw(img)
    add_gradient_overlay(draw, W, H)
    add_moon_element(draw, W, H, cx=W//2, cy=250, radius=120, alpha=20)
    
    # 小字标签
    draw.text((W//2-80, 200), "围绝经期 · 陪伴计划", font=FONTS['tiny'], fill=ORANGE)
    
    # 主标题
    draw_text_centered(draw, "潮热、睡不好、情绪起伏", 400, 'bold', ORANGE, W)
    
    # 分隔
    draw.rectangle([W//2-40, 450, W//2+40, 452], fill=ORANGE)
    
    draw_text_centered(draw, "这可能不是你「想太多」", 510, 'medium', TEXT_MAIN, W)
    draw_text_centered(draw, "我们想邀请你", 570, 'regular', TEXT_GRAY, W)
    draw_text_centered(draw, "加入一次内测", 620, 'medium', ORANGE_LIGHT, W)
    
    draw_bottom_bar(draw, W, H)
    draw_qr_placeholder(draw, W-120, H-170, 80)
    
    img.save(f"{OUTPUT_DIR}/xiaohongshu/set2-cover.png")
    print("✅ 小红书 文案2-图1 封面")
    
    # ── 图2：症状清单 ──
    img2 = create_canvas(W, H)
    draw2 = ImageDraw.Draw(img2)
    add_gradient_overlay(draw2, W, H)
    
    draw2.text((80, 160), "如果你正在经历：", font=FONTS['small'], fill=TEXT_GRAY)
    
    symptoms = [
        "突然潮热、出汗、脸热、心慌",
        "晚上睡不好，半夜醒来难以入睡",
        "情绪起伏变大，烦躁、焦虑",
        "月经周期或身体感受变化",
        "注意力下降，觉得自己不在状态",
    ]
    
    y = 230
    for s in symptoms:
        # 编号圆圈
        draw2.ellipse([100, y+5, 120, y+25], fill=ORANGE)
        draw2.text((107, y+6), str(symptoms.index(s)+1), font=FONTS['tiny'], fill=(0,0,0))
        draw2.text((135, y+5), s, font=FONTS['regular'], fill=TEXT_MAIN)
        y += 55
    
    # 强调
    y += 20
    draw2.text((100, y), "你不是一个人。", font=FONTS['medium'], fill=ORANGE)
    draw2.text((100, y+45), "你的感受值得被记录、被理解。", font=FONTS['regular'], fill=TEXT_GRAY)
    
    draw_bottom_bar(draw2, W, H)
    draw_qr_placeholder(draw2, W-120, H-170, 80)
    
    img2.save(f"{OUTPUT_DIR}/xiaohongshu/set2-symptoms.png")
    print("✅ 小红书 文案2-图2 症状")
    
    # ── 图3：陪伴工具 ──
    img3 = create_canvas(W, H)
    draw3 = ImageDraw.Draw(img3)
    add_gradient_overlay(draw3, W, H)
    add_moon_element(draw3, W, H, cx=150, cy=200, radius=80, alpha=18)
    
    draw3.text((80, 180), "我们正在做一个", font=FONTS['regular'], fill=TEXT_GRAY)
    draw3.text((80, 225), "围绝经期陪伴工具", font=FONTS['bold'], fill=ORANGE)
    
    features2 = [
        ("🌙", "记录潮热、睡眠、情绪变化"),
        ("🌙", "温柔易懂的科普内容"),
        ("🌙", "陪你慢慢看见身体的节奏"),
    ]
    y = 330
    for icon, text in features2:
        draw3.rounded_rectangle([100, y, W-100, y+55], radius=28, fill=CARD_BG, outline=(249, 115, 22, 60), width=1)
        draw3.text((130, y+15), f"{icon} {text}", font=FONTS['regular'], fill=TEXT_MAIN)
        y += 70
    
    # CTA 按钮
    btn_y = y + 30
    draw3.rounded_rectangle([W//4-10, btn_y, W*3//4+10, btn_y+55], radius=28, fill=ORANGE)
    draw3.text((W//2-110, btn_y+14), "关注公众号 · 回复【月亮】", font=FONTS['small'], fill=(0, 0, 0))
    
    draw_bottom_bar(draw3, W, H)
    
    img3.save(f"{OUTPUT_DIR}/xiaohongshu/set2-tool.png")
    print("✅ 小红书 文案2-图3 工具")


# ═══════════════════════════════════════════
#  发布会招募海报 - 文案1（通用版）
# ═══════════════════════════════════════════

def make_poster_set1():
    """文案1 发布会海报（2版）"""
    W, H = 1080, 1920  # 9:16 海报竖版
    
    # ── 版A：温柔陪伴版 ──
    img = create_canvas(W, H)
    draw = ImageDraw.Draw(img)
    add_gradient_overlay(draw, W, H)
    add_moon_element(draw, W, H, cx=W//2, cy=280, radius=150, alpha=28)
    
    # 顶部品牌标
    draw.text((60, 60), "Stacy Moon", font=FONTS['en_regular'], fill=(249, 115, 22, 120))
    draw.rectangle([60, 90, 200, 91], fill=(249, 115, 22, 80))
    
    # 主标题区
    draw_text_centered(draw, "内测发布会", 400, 'bold', ORANGE, W)
    draw_text_centered(draw, "邀请函", 470, 'bold', ORANGE_LIGHT, W)
    
    # 装饰线 + 月相
    draw.rectangle([W//2-80, 520, W//2+80, 522], fill=ORANGE)
    
    # 副标题
    draw_text_centered(draw, "给正在经历潮热、睡不好、", 600, 'medium', TEXT_MAIN, W)
    draw_text_centered(draw, "情绪起伏的妈妈们", 650, 'medium', ORANGE, W)
    
    # 信息卡片
    card_y = 740
    draw.rounded_rectangle([80, card_y, W-80, card_y+260], radius=16, fill=CARD_BG, outline=(249, 115, 22, 80), width=1)
    
    info_lines = [
        ("📅", "时间", "2026年7月 · 线上直播"),
        ("🎤", "内容", "产品首发 + 用户分享"),
        ("🎁", "内测福利", "首批用户专属权益"),
    ]
    iy = card_y + 30
    for icon, label, value in info_lines:
        draw.text((120, iy), f"{icon}  {label}", font=FONTS['small'], fill=TEXT_GRAY)
        draw.text((120, iy+30), value, font=FONTS['regular'], fill=TEXT_MAIN)
        iy += 80
    
    # CTA
    cta_y = card_y + 310
    draw.rounded_rectangle([W//4, cta_y, W*3//4, cta_y+60], radius=30, fill=ORANGE)
    draw.text((W//2-85, cta_y+16), "关注公众号 · 回复【月亮】", font=FONTS['small'], fill=(0, 0, 0))
    
    # 底部说明
    draw_text_centered(draw, "扫码关注即可报名", H-120, 'tiny', TEXT_GRAY, W)
    draw_qr_placeholder(draw, W//2-40, H-100, 80)
    
    img.save(f"{OUTPUT_DIR}/poster/set1-warm.png")
    print("✅ 海报 文案1-版A 温柔陪伴版")
    
    # ── 版B：家庭沟通版 ──
    img2 = create_canvas(W, H)
    draw2 = ImageDraw.Draw(img2)
    add_gradient_overlay(draw2, W, H)
    
    # 不同布局 - 更聚焦家庭主题
    draw2.text((60, 60), "Stacy Moon", font=FONTS['en_regular'], fill=(249, 115, 22, 120))
    draw2.rectangle([60, 90, 200, 91], fill=(249, 115, 22, 80))
    
    # 大标题
    draw_text_centered(draw2, "你有多久", 320, 'bold', TEXT_MAIN, W)
    draw_text_centered(draw2, "没有好好问过妈妈：", 390, 'bold', TEXT_MAIN, W)
    draw_text_centered(draw2, "「你最近还好吗」", 460, 'bold', ORANGE, W)
    
    # 分隔
    draw2.rectangle([W//2-60, 510, W//2+60, 512], fill=ORANGE)
    
    # 核心信息
    draw_text_centered(draw2, "Stacy Moon 内测发布会", 600, 'medium', ORANGE_LIGHT, W)
    
    # 亮点卡片
    card_y2 = 700
    draw2.rounded_rectangle([80, card_y2, W-80, card_y2+200], radius=16, fill=CARD_BG, outline=(249, 115, 22, 60), width=1)
    
    points = [
        "👩‍👧 女儿带妈妈一起体验",
        "🌙 更年期陪伴工具首次公开",
        "💬 专家对话 × 真实用户分享",
    ]
    py = card_y2 + 35
    for p in points:
        draw2.text((120, py), p, font=FONTS['regular'], fill=TEXT_MAIN)
        py += 55
    
    # CTA
    cta_y2 = card_y2 + 250
    draw2.rounded_rectangle([W//4, cta_y2, W*3//4, cta_y2+60], radius=30, fill=ORANGE)
    draw2.text((W//2-85, cta_y2+16), "关注公众号 · 回复【月亮】", font=FONTS['small'], fill=(0, 0, 0))
    
    draw_text_centered(draw2, "带上妈妈一起参加", H-120, 'tiny', TEXT_GRAY, W)
    draw_qr_placeholder(draw2, W//2-40, H-100, 80)
    
    img2.save(f"{OUTPUT_DIR}/poster/set1-family.png")
    print("✅ 海报 文案1-版B 家庭沟通版")


# ═══════════════════════════════════════════
#  发布会招募海报 - 文案2（围绝经期版）
# ═══════════════════════════════════════════

def make_poster_set2():
    """文案2 发布会海报（2版）"""
    W, H = 1080, 1920
    
    # ── 版A：温柔直接版 ──
    img = create_canvas(W, H)
    draw = ImageDraw.Draw(img)
    add_gradient_overlay(draw, W, H)
    add_moon_element(draw, W, H, cx=W-120, cy=200, radius=130, alpha=22)
    
    draw.text((60, 60), "Stacy Moon", font=FONTS['en_regular'], fill=(249, 115, 22, 120))
    draw.rectangle([60, 90, 200, 91], fill=(249, 115, 22, 80))
    
    # 标题
    draw_text_centered(draw, "围绝经期", 350, 'bold', ORANGE, W)
    draw_text_centered(draw, "不是你的错", 420, 'bold', ORANGE_LIGHT, W)
    
    draw.rectangle([W//2-50, 470, W//2+50, 472], fill=ORANGE)
    
    draw_text_centered(draw, "Stacy Moon 内测发布会邀请你", 560, 'medium', TEXT_MAIN, W)
    
    # 信息卡片
    card_y = 660
    draw.rounded_rectangle([60, card_y, W-60, card_y+280], radius=16, fill=CARD_BG, outline=(249, 115, 22, 80), width=1)
    
    info = [
        "🌙 产品首次公开亮相",
        "📊 更年期数据洞察分享",
        "💝 内测用户专属福利",
        "🎯 与团队面对面交流",
    ]
    iy = card_y + 35
    for item in info:
        draw.text((100, iy), item, font=FONTS['regular'], fill=TEXT_MAIN)
        iy += 55
    
    # 副标题
    draw_text_centered(draw, "你的感受值得被认真对待", card_y+330, 'small', ORANGE_LIGHT, W)
    
    # CTA
    cta_y = card_y + 390
    draw.rounded_rectangle([W//4, cta_y, W*3//4, cta_y+60], radius=30, fill=ORANGE)
    draw.text((W//2-85, cta_y+16), "关注公众号 · 回复【月亮】", font=FONTS['small'], fill=(0, 0, 0))
    
    draw_text_centered(draw, "扫码关注即可报名", H-120, 'tiny', TEXT_GRAY, W)
    draw_qr_placeholder(draw, W//2-40, H-100, 80)
    
    img.save(f"{OUTPUT_DIR}/poster/set2-direct.png")
    print("✅ 海报 文案2-版A 温柔直接版")
    
    # ── 版B：自我照护版 ──
    img2 = create_canvas(W, H)
    draw2 = ImageDraw.Draw(img2)
    add_gradient_overlay(draw2, W, H)
    
    draw2.text((60, 60), "Stacy Moon", font=FONTS['en_regular'], fill=(249, 115, 22, 120))
    draw2.rectangle([60, 90, 200, 91], fill=(249, 115, 22, 80))
    
    # 大字标题
    draw_text_centered(draw2, "从今天开始", 300, 'bold', TEXT_MAIN, W)
    draw_text_centered(draw2, "不再把身体发出的信号", 370, 'bold', TEXT_MAIN, W)
    draw_text_centered(draw2, "当成「我太矫情了」", 440, 'bold', ORANGE, W)
    
    draw2.rectangle([W//2-50, 490, W//2+50, 492], fill=ORANGE)
    
    draw_text_centered(draw2, "围绝经期陪伴工具", 570, 'medium', ORANGE_LIGHT, W)
    draw_text_centered(draw2, "内测发布会", 620, 'medium', ORANGE_LIGHT, W)
    
    # 活动详情卡片
    card_y2 = 720
    draw2.rounded_rectangle([60, card_y2, W-60, card_y2+180], radius=16, fill=CARD_BG, outline=(249, 115, 22, 60), width=1)
    
    details = [
        "📅 2026年7月 · 线上直播",
        "👩 面向围绝经期女性",
        "🎁 首批内测用户招募中",
    ]
    dy = card_y2 + 30
    for d in details:
        draw2.text((100, dy), d, font=FONTS['regular'], fill=TEXT_MAIN)
        dy += 50
    
    # 引语
    draw_text_centered(draw2, "从记录和理解自己的身体开始", card_y2+230, 'small', TEXT_GRAY, W)
    
    # CTA
    cta_y2 = card_y2 + 290
    draw2.rounded_rectangle([W//4, cta_y2, W*3//4, cta_y2+60], radius=30, fill=ORANGE)
    draw2.text((W//2-85, cta_y2+16), "关注公众号 · 回复【月亮】", font=FONTS['small'], fill=(0, 0, 0))
    
    draw_text_centered(draw2, "扫码关注即可报名", H-120, 'tiny', TEXT_GRAY, W)
    draw_qr_placeholder(draw2, W//2-40, H-100, 80)
    
    img2.save(f"{OUTPUT_DIR}/poster/set2-selfcare.png")
    print("✅ 海报 文案2-版B 自我照护版")


# ═══════════════════════════════════════════
#  主入口
# ═══════════════════════════════════════════

if __name__ == '__main__':
    print("=" * 50)
    print("🌙 Stacy Moon 设计图生成")
    print("=" * 50)
    
    print("\n📱 小红书配图 - 文案1")
    make_xhs_set1()
    
    print("\n📱 小红书配图 - 文案2")
    make_xhs_set2()
    
    print("\n🎨 发布会海报 - 文案1")
    make_poster_set1()
    
    print("\n🎨 发布会海报 - 文案2")
    make_poster_set2()
    
    print("\n" + "=" * 50)
    print("✅ 全部生成完成！")
    print(f"📂 输出目录: {OUTPUT_DIR}")
    print("=" * 50)
