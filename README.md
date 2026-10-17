# 和光 · 新中式居所

以 Blender 设计的三卧住宅为基础，提供可在电脑与手机浏览的交互式三维模型与设计图集。

**在线访问：[和光 · 3D 空间](https://chenghongkuan.github.io/heguang-home/)**

- 全屋鸟瞰、正交平面，以及客厅、电视墙、三间卧室和餐厨共 8 个视角。
- 旋转、缩放、平移、双击定位；默认剖切高度 2.85 m，可调节墙体剖切高度、切换顶面及房间标注。
- 手机单指旋转、双指缩放与移动；支持当前视图截图保存。
- 9 张设计图、分类图集与 PDF 图册。

## 本地查看

不需要安装 Node.js 或构建依赖：

```sh
python3 -m http.server 8000 --directory site
```

浏览器打开 `http://localhost:8000`。请通过 HTTP 服务查看，直接双击 HTML 不能加载 ES 模块和模型。

## 文件

- `site/assets/home.glb`：从 Blender 4.5.3 LTS 导出的全屋模型，约 20.6 MiB、326,870 个三角形，单位米，Y 轴向上。
- `site/app.js`：Three.js 查看器、视角、剖切与图集逻辑；将静态几何按材质合并，减少绘制调用。
- `site/assets/`：WebP 效果图、缩略图、图集索引和 PDF。
- `site/vendor/`：固定版本 Three.js 0.186.1 及所需模块；运行时不依赖外部 CDN。MIT 许可见 `THREE-LICENSE.txt`。
- `.github/workflows/deploy-pages.yml`：推送 `main` 后发布 `site/` 到 GitHub Pages。

## 设计与显示说明

保留三间卧室，两位长辈分房居住：图左下为长辈卧室 A，图中下为长辈卧室 B，图上方为客房。两间长辈房均用 1.50 m 床，客房配 1.35 m 床与书桌。设计采用暖白、胡桃木、亚麻和水墨；净高暂按 2.80 m。

卧室采用蜜棕橡木地板，客餐厅采用暖灰米色哑光砖。GLB 内嵌地板、砖面、胡桃木与织物的图像 PBR 贴图，保留木纹、拼缝、粗糙度与法线细节；网页降低曝光，并使用各向异性过滤改善斜视纹理。

交互模型使用实时 PBR 照明，光影与 Blender Cycles 高清效果图略有差异。剖切只作用于建筑、门窗与相关挂饰，独立家具保持完整。

本项目是概念设计，不是施工图；尺寸、结构、机电和适老细节需现场复核。图面上、下、左、右不代表实际地理朝向。

## 来源

模型及图集为本项目创建。网页引擎：[Three.js](https://threejs.org/)；发布方式：[GitHub Pages 官方文档](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。
