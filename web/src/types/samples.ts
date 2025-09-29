export type SampleProduct = {
    id: string;
    title: string;
    handle: string;
    productType?: string | null;
    featuredImage?: { url: string; altText?: string | null } | null;
};

export type SampleLine = {
    productId: string;
    title: string;
    quantity: number;
};