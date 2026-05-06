import { request } from '@nativescript-community/https';
import { ImageSource } from '@nativescript/core';
import { wrapNativeHttpException } from '~/services/api';
import type { OCRData } from 'plugin-nativeprocessor';

const MISTRAL_OCR_URL = 'https://api.mistral.ai/v1/ocr';
const MISTRAL_OCR_MODEL = 'mistral-ocr-latest';

export async function mistralOcrImage(imagePath: string, apiKey: string, onProgress?: (progress: number) => void): Promise<OCRData> {
    onProgress?.(5);
    const imageSource = await ImageSource.fromFile(imagePath);
    if (!imageSource) {
        throw new Error('Failed to load image for Mistral OCR');
    }
    const base64 = imageSource.toBase64String('jpg', 85);
    onProgress?.(20);

    const requestParams = {
        url: MISTRAL_OCR_URL,
        method: 'POST' as const,
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        content: JSON.stringify({
            model: MISTRAL_OCR_MODEL,
            document: {
                type: 'image_url',
                image_url: `data:image/jpeg;base64,${base64}`
            }
        })
    };

    try {
        onProgress?.(30);
        const response = await request(requestParams);
        onProgress?.(90);

        if (response.statusCode !== 200) {
            const body = response.content?.toString() ?? '';
            throw new Error(`Mistral OCR API error ${response.statusCode}: ${body}`);
        }

        const data = response.content.toJSON() as MistralOCRResponse;
        return transformToOCRData(data, imageSource.width, imageSource.height);
    } catch (error) {
        throw wrapNativeHttpException(error, requestParams);
    } finally {
        onProgress?.(100);
    }
}

interface MistralOCRPage {
    index: number;
    markdown: string;
    dimensions?: { width: number; height: number; dpi: number };
}

interface MistralOCRResponse {
    pages?: MistralOCRPage[];
    model?: string;
    usage_info?: object;
}

function transformToOCRData(response: MistralOCRResponse, imageWidth: number, imageHeight: number): OCRData {
    const pages = response.pages ?? [];
    const fullText = pages.map((p) => p.markdown).join('\n\n');

    const blocks = pages.map((page) => ({
        box: { x: 0, y: 0, width: imageWidth, height: imageHeight },
        text: page.markdown,
        confidence: 1.0
    }));

    // If no blocks, return empty but valid structure so callers handle it correctly
    return {
        text: fullText,
        blocks,
        imageWidth,
        imageHeight
    };
}
