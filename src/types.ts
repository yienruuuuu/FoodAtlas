export type Rating = 'recommend' | 'neutral' | 'avoid' | null;
export interface BaseEntity { id: string; createdAt: string; updatedAt: string; createdByProfileId: string; revisionId: string; parentRevisionIds: string[]; deletedAt?: string }
export interface Profile { id: string; displayName: string }
export type CatalogOptionKind = 'category' | 'location' | 'budget' | 'customTag';
export interface CatalogOption extends BaseEntity { kind: CatalogOptionKind; label: string; parentOptionId?: string; budgetMin?: number; budgetMax?: number; archivedAt?: string }
export interface Restaurant extends BaseEntity { name: string; categoryTags: string[]; categoryOptionIds?: string[]; customTags?: string[]; customTagOptionIds?: string[]; locationText: string; locationOptionId?: string; budgetMin?: number; budgetMax?: number; budgetOptionId?: string; mapUrl?: string; memo?: string; coverAssetId?: string }
export interface Wishlist extends BaseEntity { restaurantId: string; profileId: string; isActive: boolean }
export interface RestaurantProfileRating extends BaseEntity { restaurantId: string; profileId: string; rating: Rating }
export interface RestaurantPost extends BaseEntity { restaurantId: string; body: string; photoAssetIds: string[]; isPinned: boolean }
export interface Asset extends BaseEntity { sha256: string; mimeType: 'image/webp'; bytes: number; width: number; height: number; blob: Blob }
export interface PhotoLink extends BaseEntity { assetId: string; restaurantId?: string; postId?: string }
export interface Dataset { id: string; profiles: [Profile, Profile]; currentProfileId: string }
export type Page = 'home' | 'atlas' | 'wishlist' | 'options' | 'settings';
