## 1. 接口描述

接口请求域名： ai3d.tencentcloudapi.com 。

混元生3D接口，基于混元大模型，根据输入的文本描述/图片智能生成3D。
默认提供3个并发，代表最多能同时处理3个已提交的任务，上一个任务处理完毕后，才能开始处理下一个任务。

<div class="rno-api-explorer">
    <div class="rno-api-explorer-inner">
        <div class="rno-api-explorer-hd">
            <div class="rno-api-explorer-title">
                推荐使用 API Explorer
            </div>
            <a href="https://console.cloud.tencent.com/api/explorer?Product=ai3d&Version=2025-05-13&Action=SubmitHunyuanTo3DProJob" class="rno-api-explorer-btn" hotrep="doc.api.explorerbtn"><i class="rno-icon-explorer"></i>点击调试</a>
        </div>
        <div class="rno-api-explorer-body">
            <div class="rno-api-explorer-cont">
                API Explorer 提供了在线调用、签名验证、SDK 代码生成和快速检索接口等能力。您可查看每次调用的请求内容和返回结果以及自动生成 SDK 调用示例。
            </div>
        </div>
    </div>
</div>

## 2. 输入参数

以下请求参数列表仅列出了接口请求参数和部分公共参数，完整公共参数列表见 [公共请求参数](/document/api/1804/120832)。

| 参数名称 | 必选 | 类型 | 描述 |
|---------|---------|---------|---------|
| Action | 是 | String | [公共参数](/document/api/1804/120832)，本接口取值：SubmitHunyuanTo3DProJob。 |
| Version | 是 | String | [公共参数](/document/api/1804/120832)，本接口取值：2025-05-13。 |
| Region | 是 | String | [公共参数](/document/api/1804/120832)，详见产品支持的 [地域列表](/document/api/1804/120832#.E5.9C.B0.E5.9F.9F.E5.88.97.E8.A1.A8)。 |
| Model | 否 | String | <p>混元生3D生成模型版本，默认为3.0，可选项：3.0，3.1<br>选择3.1版本时，LowPoly参数不可用。</p><br/>示例值：3.0 |
| Prompt | 否 | String | <p>文生3D，3D内容的描述，中文正向提示词。<br>最多支持1024个 utf-8 字符。<br>ImageBase64、ImageUrl和 Prompt必填其一，且Prompt和ImageBase64/ImageUrl不能同时存在。</p><br/>示例值：一只小猫 |
| ImageBase64 | 否 | String | <p>输入图 Base64 数据。<br>大小: 单边分辨率要求不小于128，不大于5000，大小≤6m (因base64编码后会大30%左右)<br>格式: jpg，png，jpeg，webp.<br>lmageBase64、lmageUr和 Prompt必填其一，且Prompt和lmageBase64/mageUr不能同时存在。</p><br/>示例值：/9j/4QlQaHR0c...N6a2M5ZCI |
| ImageUrl | 否 | String | <p>输入图Url<br>大小: 单边分辨率要求不小于128，不大于5000，大小≤8m<br>格式: jpg，png，jpeg，webp.<br>lmageBase64、lmageUr和 Prompt必填其一，且Prompt和lmageBase64/mageUr不能同时存在。</p><br/>示例值：https://cos.ap-guangzhou.myqcloud.com/image.jpg |
| MultiViewImages.N | 否 | Array of [ViewImage](/document/api/1804/120828#ViewImage) | <p>多视角的模型图片，视角参考值：<br>left：左视图；<br>right：右视图；<br>back：后视图；<br>top：顶视图（仅3.1版本支持）；<br>bottom：底视图（仅3.1版本支持）；<br>left_front：左前45°视图（仅3.1版本支持）；<br>right_front：右前45°视图（仅3.1版本支持）；</p><p>每个视角仅限制一张图片。<br>●图片大小限制：编码后所有图片大小总和不可超过8M。（base64编码下图片大小总和不超过6M，因base64编码后图片大小会大30%左右）<br>●图片分辨率限制：单边分辨率小于5000且大于128。<br>●支持图片格式：支持jpg或png</p> |
| EnablePBR | 否 | Boolean | <p>是否开启 PBR材质生成，默认 false。</p><br/>示例值：true |
| FaceCount | 否 | Integer | <p>生成3D模型的面数，默认值为500000。可支持生成面数范围，参考值：3000-1500000。GenerateType中选择LowPoly时，此参数不生效。</p><p>取值范围：[3000, 1500000]</p><br/>示例值：100000 |
| GenerateType | 否 | String | <p>生成任务类型，默认Normal</p><p>枚举值：</p><ul><li>Normal： 可生成带纹理的几何模型</li><li>LowPoly： 可生成智能拓扑后的模型，FaceCount参数不生效。</li><li>Geometry： 可生成不带纹理的几何模型（白模），EnablePBR参数不生效。</li><li>Sketch： 可输入草图或线稿图生成模型，此模式下prompt和ImageUrl/ImageBase64可一起输入。</li></ul><br/>示例值：Normal |
| PolygonType | 否 | String | <p>该参数仅在GenerateType中选择LowPoly模式可生效。</p><p>多边形类型，表示模型的表面由几边形网格构成，默认为triangle,参考值:<br>triangle: 三角形面。<br>quadrilateral: 四边形面与三角形面混合生成。</p><br/>示例值：triangle |
| ResultFormat | 否 | String | <p>生成模型的格式，仅限制生成一种格式； 生成模型文件组默认返回obj、glb格式（开启时Geometry参数时，默认为glb格式）； 可选值：STL，USDZ，FBX；</p><br/>示例值：STL |

## 3. 输出参数

| 参数名称 | 类型 | 描述 |
|---------|---------|---------|
| JobId | String | <p>任务ID（有效期24小时）</p><br/>示例值：1357237233311637504|
| RequestId | String | 唯一请求 ID，由服务端生成，每次请求都会返回（若请求因其他原因未能抵达服务端，则该次请求不会获得 RequestId）。定位问题时需要提供该次请求的 RequestId。|

## 4. 示例

### 示例1 提交生3D专业版示例

#### 输入示例

```
POST / HTTP/1.1
Host: ai3d.tencentcloudapi.com
Content-Type: application/json
X-TC-Action: SubmitHunyuanTo3DProJob
<公共请求参数>

{
    "ImageUrl": "https://cos.ap-guangzhou.myqcloud.com/input.png"
}
```

#### 输出示例

```json
{
    "Response": {
        "JobId": "1357237233311637504",
        "RequestId": "173f8c3b-d559-4e17-aac7-4e42303773ac"
    }
}
```


## 5. 开发者资源

### 腾讯云 API 平台

[腾讯云 API 平台](https://cloud.tencent.com/api) 是综合 API 文档、错误码、API Explorer 及 SDK 等资源的统一查询平台，方便您从同一入口查询及使用腾讯云提供的所有 API 服务。

### API Inspector

用户可通过 [API Inspector](https://cloud.tencent.com/document/product/1278/49361) 查看控制台每一步操作关联的 API 调用情况，并自动生成各语言版本的 API 代码，也可前往 [API Explorer](https://cloud.tencent.com/document/product/1278/46697) 进行在线调试。

### SDK

云 API 3.0 提供了配套的开发工具集（SDK），支持多种编程语言，能更方便的调用 API。
* Tencent Cloud SDK 3.0 for Python: [CNB](https://cnb.cool/tencent/cloud/api/sdk/tencentcloud-sdk-python/-/blob/master/tencentcloud/ai3d/v20250513/ai3d_client.py), [GitHub](https://github.com/TencentCloud/tencentcloud-sdk-python/blob/master/tencentcloud/ai3d/v20250513/ai3d_client.py), [Gitee](https://gitee.com/TencentCloud/tencentcloud-sdk-python/blob/master/tencentcloud/ai3d/v20250513/ai3d_client.py)
* Tencent Cloud SDK 3.0 for Java: [CNB](https://cnb.cool/tencent/cloud/api/sdk/tencentcloud-sdk-java/-/blob/master/src/main/java/com/tencentcloudapi/ai3d/v20250513/Ai3dClient.java), [GitHub](https://github.com/TencentCloud/tencentcloud-sdk-java/blob/master/src/main/java/com/tencentcloudapi/ai3d/v20250513/Ai3dClient.java), [Gitee](https://gitee.com/TencentCloud/tencentcloud-sdk-java/blob/master/src/main/java/com/tencentcloudapi/ai3d/v20250513/Ai3dClient.java)
* Tencent Cloud SDK 3.0 for PHP: [CNB](https://cnb.cool/tencent/cloud/api/sdk/tencentcloud-sdk-php/-/blob/master/src/TencentCloud/Ai3d/V20250513/Ai3dClient.php), [GitHub](https://github.com/TencentCloud/tencentcloud-sdk-php/blob/master/src/TencentCloud/Ai3d/V20250513/Ai3dClient.php), [Gitee](https://gitee.com/TencentCloud/tencentcloud-sdk-php/blob/master/src/TencentCloud/Ai3d/V20250513/Ai3dClient.php)
* Tencent Cloud SDK 3.0 for Go: [CNB](https://cnb.cool/tencent/cloud/api/sdk/tencentcloud-sdk-go/-/blob/master/tencentcloud/ai3d/v20250513/client.go), [GitHub](https://github.com/TencentCloud/tencentcloud-sdk-go/blob/master/tencentcloud/ai3d/v20250513/client.go), [Gitee](https://gitee.com/TencentCloud/tencentcloud-sdk-go/blob/master/tencentcloud/ai3d/v20250513/client.go)
* Tencent Cloud SDK 3.0 for Node.js: [CNB](https://cnb.cool/tencent/cloud/api/sdk/tencentcloud-sdk-nodejs/-/blob/master/src/services/ai3d/v20250513/ai3d_client.ts), [GitHub](https://github.com/TencentCloud/tencentcloud-sdk-nodejs/blob/master/src/services/ai3d/v20250513/ai3d_client.ts), [Gitee](https://gitee.com/TencentCloud/tencentcloud-sdk-nodejs/blob/master/src/services/ai3d/v20250513/ai3d_client.ts)
* Tencent Cloud SDK 3.0 for .NET: [CNB](https://cnb.cool/tencent/cloud/api/sdk/tencentcloud-sdk-dotnet/-/blob/master/TencentCloud/Ai3d/V20250513/Ai3dClient.cs), [GitHub](https://github.com/TencentCloud/tencentcloud-sdk-dotnet/blob/master/TencentCloud/Ai3d/V20250513/Ai3dClient.cs), [Gitee](https://gitee.com/TencentCloud/tencentcloud-sdk-dotnet/blob/master/TencentCloud/Ai3d/V20250513/Ai3dClient.cs)
* Tencent Cloud SDK 3.0 for C++: [CNB](https://cnb.cool/tencent/cloud/api/sdk/tencentcloud-sdk-cpp/-/blob/master/ai3d/src/v20250513/Ai3dClient.cpp), [GitHub](https://github.com/TencentCloud/tencentcloud-sdk-cpp/blob/master/ai3d/src/v20250513/Ai3dClient.cpp), [Gitee](https://gitee.com/TencentCloud/tencentcloud-sdk-cpp/blob/master/ai3d/src/v20250513/Ai3dClient.cpp)
* Tencent Cloud SDK 3.0 for Ruby: [CNB](https://cnb.cool/tencent/cloud/api/sdk/tencentcloud-sdk-ruby/-/blob/master/tencentcloud-sdk-ai3d/lib/v20250513/client.rb), [GitHub](https://github.com/TencentCloud/tencentcloud-sdk-ruby/blob/master/tencentcloud-sdk-ai3d/lib/v20250513/client.rb), [Gitee](https://gitee.com/TencentCloud/tencentcloud-sdk-ruby/blob/master/tencentcloud-sdk-ai3d/lib/v20250513/client.rb)

### 命令行工具

* [Tencent Cloud CLI 3.0](https://cloud.tencent.com/document/product/440/6176)

## 6. 错误码

该接口暂无业务逻辑相关的错误码，其他错误码详见 [公共错误码](/document/api/1804/120837#.E5.85.AC.E5.85.B1.E9.94.99.E8.AF.AF.E7.A0.81)。
