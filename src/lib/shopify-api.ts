import { prisma } from "./prisma";

const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION ?? "2026-07";

type ThrottleStatus = {
  maximumAvailable: number;
  currentlyAvailable: number;
  restoreRate: number;
};

type GraphQLCost = {
  requestedQueryCost: number;
  actualQueryCost: number;
  throttleStatus: ThrottleStatus;
};

type GraphQLResponse<T> = {
  data: T;
  errors?: { message: string; extensions?: { code: string } }[];
  extensions?: { cost: GraphQLCost };
};

type ProductImage = {
  shopifyImageId: string;
  url: string;
  width: number | null;
  height: number | null;
  altText: string | null;
};

type ProductWithImages = {
  shopifyProductId: string;
  title: string;
  images: ProductImage[];
};

const PRODUCTS_QUERY = `
  query FetchProductsWithImages($numProducts: Int!, $cursor: String) {
    products(first: $numProducts, after: $cursor) {
      nodes {
        id
        title
        media(first: 50) {
          nodes {
            ... on MediaImage {
              id
              image {
                url
                width
                height
                altText
              }
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

async function shopifyGraphQL<T>(
  shopDomain: string,
  accessToken: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<GraphQLResponse<T>> {
  const url = `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`Shopify API error: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();

  if (result.errors?.length) {
    const throttled = result.errors.find(
      (e: { extensions?: { code: string } }) => e.extensions?.code === "THROTTLED",
    );
    if (throttled) {
      throw new ThrottledError(throttled.message, result.extensions?.cost);
    }
    throw new Error(`GraphQL errors: ${result.errors.map((e: { message: string }) => e.message).join(", ")}`);
  }

  if (result.extensions?.cost) {
    const { throttleStatus } = result.extensions.cost;
    if (throttleStatus.currentlyAvailable < 200) {
      const waitMs = Math.ceil(((200 - throttleStatus.currentlyAvailable) / throttleStatus.restoreRate) * 1000);
      await sleep(waitMs);
    }
  }

  return result;
}

export class ThrottledError extends Error {
  cost?: GraphQLCost;

  constructor(message: string, cost?: GraphQLCost) {
    super(message);
    this.name = "ThrottledError";
    this.cost = cost;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractShopifyId(gid: string): string {
  const parts = gid.split("/");
  return parts[parts.length - 1];
}

type ProductsData = {
  products: {
    nodes: {
      id: string;
      title: string;
      media: {
        nodes: {
          id: string;
          image: {
            url: string;
            width: number | null;
            height: number | null;
            altText: string | null;
          } | null;
        }[];
      };
    }[];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
};

export async function fetchAllProducts(shopDomain: string): Promise<ProductWithImages[]> {
  const shop = await prisma.shop.findUnique({ where: { shopDomain } });
  if (!shop) throw new Error(`Shop not found: ${shopDomain}`);

  const products: ProductWithImages[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;
  let retries = 0;
  const maxRetries = 3;

  while (hasNextPage) {
    try {
      const response: GraphQLResponse<ProductsData> = await shopifyGraphQL<ProductsData>(
        shopDomain,
        shop.accessToken,
        PRODUCTS_QUERY,
        { numProducts: 50, cursor },
      );

      for (const node of response.data.products.nodes) {
        const images: ProductImage[] = [];

        for (const media of node.media.nodes) {
          if (media.image) {
            images.push({
              shopifyImageId: extractShopifyId(media.id),
              url: media.image.url,
              width: media.image.width,
              height: media.image.height,
              altText: media.image.altText,
            });
          }
        }

        if (images.length > 0) {
          products.push({
            shopifyProductId: extractShopifyId(node.id),
            title: node.title,
            images,
          });
        }
      }

      hasNextPage = response.data.products.pageInfo.hasNextPage;
      cursor = response.data.products.pageInfo.endCursor;
      retries = 0;

    } catch (error) {
      if (error instanceof ThrottledError && retries < maxRetries) {
        const waitTime = Math.pow(2, retries) * 3000;
        retries++;
        await sleep(waitTime);
        continue;
      }
      throw error;
    }
  }

  return products;
}

export async function fetchImageFileSize(url: string): Promise<{ size: number | null; contentType: string | null }> {
  try {
    const response = await fetch(url, { method: "HEAD" });
    if (!response.ok) return { size: null, contentType: null };

    const contentLength = response.headers.get("content-length");
    const contentType = response.headers.get("content-type");

    return {
      size: contentLength ? parseInt(contentLength, 10) : null,
      contentType: contentType?.split(";")[0] ?? null,
    };
  } catch {
    return { size: null, contentType: null };
  }
}
