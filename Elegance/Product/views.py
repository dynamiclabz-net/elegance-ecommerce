from django.db.models import Q
from rest_framework import viewsets, status
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.response import Response

from utils.decorators import handle_exceptions, check_authentication

from .models import (
    Category, SubCategory, ProductType,
    Attribute, AttributeValue,
    Product, ProductImage, ProductVariant,
)
from .serializers import (
    CategorySerializer, SubCategorySerializer, ProductTypeSerializer,
    AttributeSerializer, AttributeValueSerializer,
    ProductListSerializer, ProductDetailSerializer,
    ProductImageSerializer, ProductVariantSerializer,
)


# ─────────────────────────────────────────────
# Category
# ─────────────────────────────────────────────
class CategoryViewSet(viewsets.ViewSet):
    parser_classes = (MultiPartParser, FormParser, JSONParser)

    @handle_exceptions
    def list(self, request):
        pk = request.query_params.get("id")
        if pk:
            category = Category.objects.filter(pk=pk).first()
            if not category:
                return Response({
                    "success": False, "user_not_logged_in": False, "user_unauthorized": False,
                    "data": None, "error": "Category not found."
                }, status=status.HTTP_404_NOT_FOUND)
            data = {"category": CategorySerializer(category, context={"request": request}).data}
            return Response({
                "success": True, "user_not_logged_in": False, "user_unauthorized": False,
                "data": data, "error": None,
            }, status=status.HTTP_200_OK)

        categories = Category.objects.all()
        if request.query_params.get("active_only") == "true":
            categories = categories.filter(is_active=True)

        data = {"categories": CategorySerializer(categories, many=True, context={"request": request}).data}
        return Response({
            "success": True, "user_not_logged_in": False, "user_unauthorized": False,
            "data": data, "error": None,
        }, status=status.HTTP_200_OK)

    @handle_exceptions
    @check_authentication(required_role="admin")
    def create(self, request):
        serializer = CategorySerializer(data=request.data)
        if not serializer.is_valid():
            return Response({
                "success": False, "user_not_logged_in": False, "user_unauthorized": False,
                "data": None, "error": serializer.errors,
            }, status=status.HTTP_400_BAD_REQUEST)

        category = serializer.save()
        return Response({
            "success": True, "user_not_logged_in": False, "user_unauthorized": False,
            "data": {"category": CategorySerializer(category, context={"request": request}).data},
            "error": None,
        }, status=status.HTTP_201_CREATED)

    @handle_exceptions
    @check_authentication(required_role="admin")
    def update(self, request, pk):
        category = Category.objects.filter(pk=pk).first()
        if not category:
            return Response({
                "success": False, "user_not_logged_in": False, "user_unauthorized": False,
                "data": None, "error": "Category not found."
            }, status=status.HTTP_404_NOT_FOUND)

        serializer = CategorySerializer(category, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response({
                "success": False, "user_not_logged_in": False, "user_unauthorized": False,
                "data": None, "error": serializer.errors,
            }, status=status.HTTP_400_BAD_REQUEST)

        serializer.save()
        return Response({
            "success": True, "user_not_logged_in": False, "user_unauthorized": False,
            "data": {"category": CategorySerializer(category, context={"request": request}).data},
            "error": None,
        }, status=status.HTTP_200_OK)

    @handle_exceptions
    @check_authentication(required_role="admin")
    def destroy(self, request, pk):
        category = Category.objects.filter(pk=pk).first()
        if not category:
            return Response({
                "success": False, "user_not_logged_in": False, "user_unauthorized": False,
                "data": None, "error": "Category not found."
            }, status=status.HTTP_404_NOT_FOUND)

        category.delete()
        return Response({
            "success": True, "user_not_logged_in": False, "user_unauthorized": False,
            "data": {"id": pk, "deleted": True}, "error": None,
        }, status=status.HTTP_200_OK)


# ─────────────────────────────────────────────
# SubCategory
# ─────────────────────────────────────────────
class SubCategoryViewSet(viewsets.ViewSet):
    parser_classes = (MultiPartParser, FormParser, JSONParser)

    @handle_exceptions
    def list(self, request):
        pk = request.query_params.get("id")
        if pk:
            subcategory = SubCategory.objects.filter(pk=pk).first()
            if not subcategory:
                return Response({
                    "success": False, "user_not_logged_in": False, "user_unauthorized": False,
                    "data": None, "error": "Sub-category not found."
                }, status=status.HTTP_404_NOT_FOUND)
            return Response({
                "success": True, "user_not_logged_in": False, "user_unauthorized": False,
                "data": {"subcategory": SubCategorySerializer(subcategory, context={"request": request}).data},
                "error": None,
            }, status=status.HTTP_200_OK)

        subcategories = SubCategory.objects.all()
        category_id = request.query_params.get("category")
        if category_id:
            subcategories = subcategories.filter(category_id=category_id)
        if request.query_params.get("active_only") == "true":
            subcategories = subcategories.filter(is_active=True)

        return Response({
            "success": True, "user_not_logged_in": False, "user_unauthorized": False,
            "data": {
                "subcategories": SubCategorySerializer(
                    subcategories, many=True, context={"request": request}
                ).data
            },
            "error": None,
        }, status=status.HTTP_200_OK)

    @handle_exceptions
    @check_authentication(required_role="admin")
    def create(self, request):
        serializer = SubCategorySerializer(data=request.data)
        if not serializer.is_valid():
            return Response({
                "success": False, "user_not_logged_in": False, "user_unauthorized": False,
                "data": None, "error": serializer.errors,
            }, status=status.HTTP_400_BAD_REQUEST)

        subcategory = serializer.save()
        return Response({
            "success": True, "user_not_logged_in": False, "user_unauthorized": False,
            "data": {"subcategory": SubCategorySerializer(subcategory).data}, "error": None,
        }, status=status.HTTP_201_CREATED)

    @handle_exceptions
    @check_authentication(required_role="admin")
    def update(self, request, pk):
        subcategory = SubCategory.objects.filter(pk=pk).first()
        if not subcategory:
            return Response({
                "success": False, "user_not_logged_in": False, "user_unauthorized": False,
                "data": None, "error": "Sub-category not found."
            }, status=status.HTTP_404_NOT_FOUND)

        serializer = SubCategorySerializer(subcategory, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response({
                "success": False, "user_not_logged_in": False, "user_unauthorized": False,
                "data": None, "error": serializer.errors,
            }, status=status.HTTP_400_BAD_REQUEST)

        serializer.save()
        return Response({
            "success": True, "user_not_logged_in": False, "user_unauthorized": False,
            "data": {"subcategory": serializer.data}, "error": None,
        }, status=status.HTTP_200_OK)

    @handle_exceptions
    @check_authentication(required_role="admin")
    def destroy(self, request, pk):
        subcategory = SubCategory.objects.filter(pk=pk).first()
        if not subcategory:
            return Response({
                "success": False, "user_not_logged_in": False, "user_unauthorized": False,
                "data": None, "error": "Sub-category not found."
            }, status=status.HTTP_404_NOT_FOUND)

        subcategory.delete()
        return Response({
            "success": True, "user_not_logged_in": False, "user_unauthorized": False,
            "data": {"id": pk, "deleted": True}, "error": None,
        }, status=status.HTTP_200_OK)


# ─────────────────────────────────────────────
# ProductType (Casual / Work / Semi-Formal / Occasion / Trousseau)
# ─────────────────────────────────────────────
class ProductTypeViewSet(viewsets.ViewSet):

    @handle_exceptions
    def list(self, request):
        pk = request.query_params.get("id")
        if pk:
            product_type = ProductType.objects.filter(pk=pk).first()
            if not product_type:
                return Response({
                    "success": False, "user_not_logged_in": False, "user_unauthorized": False,
                    "data": None, "error": "Product type not found."
                }, status=status.HTTP_404_NOT_FOUND)
            return Response({
                "success": True, "user_not_logged_in": False, "user_unauthorized": False,
                "data": {"product_type": ProductTypeSerializer(product_type).data}, "error": None,
            }, status=status.HTTP_200_OK)

        product_types = ProductType.objects.all()
        if request.query_params.get("active_only") == "true":
            product_types = product_types.filter(is_active=True)

        return Response({
            "success": True, "user_not_logged_in": False, "user_unauthorized": False,
            "data": {"product_types": ProductTypeSerializer(product_types, many=True).data},
            "error": None,
        }, status=status.HTTP_200_OK)

    @handle_exceptions
    @check_authentication(required_role="admin")
    def create(self, request):
        serializer = ProductTypeSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({
                "success": False, "user_not_logged_in": False, "user_unauthorized": False,
                "data": None, "error": serializer.errors,
            }, status=status.HTTP_400_BAD_REQUEST)

        product_type = serializer.save()
        return Response({
            "success": True, "user_not_logged_in": False, "user_unauthorized": False,
            "data": {"product_type": ProductTypeSerializer(product_type).data}, "error": None,
        }, status=status.HTTP_201_CREATED)

    @handle_exceptions
    @check_authentication(required_role="admin")
    def update(self, request, pk):
        product_type = ProductType.objects.filter(pk=pk).first()
        if not product_type:
            return Response({
                "success": False, "user_not_logged_in": False, "user_unauthorized": False,
                "data": None, "error": "Product type not found."
            }, status=status.HTTP_404_NOT_FOUND)

        serializer = ProductTypeSerializer(product_type, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response({
                "success": False, "user_not_logged_in": False, "user_unauthorized": False,
                "data": None, "error": serializer.errors,
            }, status=status.HTTP_400_BAD_REQUEST)

        serializer.save()
        return Response({
            "success": True, "user_not_logged_in": False, "user_unauthorized": False,
            "data": {"product_type": serializer.data}, "error": None,
        }, status=status.HTTP_200_OK)

    @handle_exceptions
    @check_authentication(required_role="admin")
    def destroy(self, request, pk):
        product_type = ProductType.objects.filter(pk=pk).first()
        if not product_type:
            return Response({
                "success": False, "user_not_logged_in": False, "user_unauthorized": False,
                "data": None, "error": "Product type not found."
            }, status=status.HTTP_404_NOT_FOUND)

        product_type.delete()
        return Response({
            "success": True, "user_not_logged_in": False, "user_unauthorized": False,
            "data": {"id": pk, "deleted": True}, "error": None,
        }, status=status.HTTP_200_OK)


# ─────────────────────────────────────────────
# Attribute + AttributeValue (dynamic — e.g. Color, Size)
# ─────────────────────────────────────────────
class AttributeViewSet(viewsets.ViewSet):

    @handle_exceptions
    def list(self, request):
        attributes = Attribute.objects.all()
        return Response({
            "success": True, "user_not_logged_in": False, "user_unauthorized": False,
            "data": {"attributes": AttributeSerializer(attributes, many=True).data}, "error": None,
        }, status=status.HTTP_200_OK)

    @handle_exceptions
    @check_authentication(required_role="admin")
    def create(self, request):
        serializer = AttributeSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({
                "success": False, "user_not_logged_in": False, "user_unauthorized": False,
                "data": None, "error": serializer.errors,
            }, status=status.HTTP_400_BAD_REQUEST)

        attribute = serializer.save()
        return Response({
            "success": True, "user_not_logged_in": False, "user_unauthorized": False,
            "data": {"attribute": AttributeSerializer(attribute).data}, "error": None,
        }, status=status.HTTP_201_CREATED)

    @handle_exceptions
    @check_authentication(required_role="admin")
    def destroy(self, request, pk):
        attribute = Attribute.objects.filter(pk=pk).first()
        if not attribute:
            return Response({
                "success": False, "user_not_logged_in": False, "user_unauthorized": False,
                "data": None, "error": "Attribute not found."
            }, status=status.HTTP_404_NOT_FOUND)

        attribute.delete()
        return Response({
            "success": True, "user_not_logged_in": False, "user_unauthorized": False,
            "data": {"id": pk, "deleted": True}, "error": None,
        }, status=status.HTTP_200_OK)


class AttributeValueViewSet(viewsets.ViewSet):

    @handle_exceptions
    @check_authentication(required_role="admin")
    def create(self, request):
        serializer = AttributeValueSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({
                "success": False, "user_not_logged_in": False, "user_unauthorized": False,
                "data": None, "error": serializer.errors,
            }, status=status.HTTP_400_BAD_REQUEST)

        value = serializer.save()
        return Response({
            "success": True, "user_not_logged_in": False, "user_unauthorized": False,
            "data": {"attribute_value": AttributeValueSerializer(value).data}, "error": None,
        }, status=status.HTTP_201_CREATED)

    @handle_exceptions
    @check_authentication(required_role="admin")
    def destroy(self, request, pk):
        value = AttributeValue.objects.filter(pk=pk).first()
        if not value:
            return Response({
                "success": False, "user_not_logged_in": False, "user_unauthorized": False,
                "data": None, "error": "Attribute value not found."
            }, status=status.HTTP_404_NOT_FOUND)

        value.delete()
        return Response({
            "success": True, "user_not_logged_in": False, "user_unauthorized": False,
            "data": {"id": pk, "deleted": True}, "error": None,
        }, status=status.HTTP_200_OK)


# ─────────────────────────────────────────────
# Product — main catalog CRUD, with filters for the shop page
# ─────────────────────────────────────────────
class ProductViewSet(viewsets.ViewSet):

    @handle_exceptions
    def retrieve(self, request, pk):
        # Admin forms pass the numeric id; the public product-detail page
        # links by slug — support both through the same endpoint.
        if str(pk).isdigit():
            product = Product.objects.filter(pk=pk).first()
        else:
            product = Product.objects.filter(slug=pk).first()
        if not product:
            return Response({
                "success": False, "user_not_logged_in": False, "user_unauthorized": False,
                "data": None, "error": "Product not found."
            }, status=status.HTTP_404_NOT_FOUND)

        data = {"product": ProductDetailSerializer(product, context={"request": request}).data}
        return Response({
            "success": True, "user_not_logged_in": False, "user_unauthorized": False,
            "data": data, "error": None,
        }, status=status.HTTP_200_OK)

    @handle_exceptions
    def list(self, request):
        """Supports admin table listing and shop-page filtering via query params:
        search, category, subcategory, product_type, min_price, max_price,
        in_stock, is_active, is_featured, sort, page, page_size."""

        products = Product.objects.select_related("category", "subcategory", "product_type")

        params = request.query_params

        search = params.get("search")
        if search:
            products = products.filter(
                Q(name__icontains=search) | Q(sku__icontains=search) | Q(description__icontains=search)
            )

        category = params.get("category")
        if category:
            products = products.filter(category_id=category)

        subcategory = params.get("subcategory")
        if subcategory:
            products = products.filter(subcategory_id=subcategory)

        product_type = params.get("product_type")
        if product_type:
            products = products.filter(product_type_id=product_type)

        min_price = params.get("min_price")
        if min_price:
            products = products.filter(price__gte=min_price)

        max_price = params.get("max_price")
        if max_price:
            products = products.filter(price__lte=max_price)

        if params.get("in_stock") == "true":
            products = products.filter(stock_quantity__gt=0)

        if params.get("is_featured") == "true":
            products = products.filter(is_featured=True)

        # Public shop pages only see active products; admin table can pass active_only=false
        if params.get("active_only", "true") == "true":
            products = products.filter(is_active=True)

        sort = params.get("sort")
        sort_map = {
            "price_asc": "price",
            "price_desc": "-price",
            "newest": "-created_at",
            "name_asc": "name",
        }
        products = products.order_by(sort_map.get(sort, "-created_at"))

        total_count = products.count()

        page = int(params.get("page", 1))
        page_size = int(params.get("page_size", 20))
        start = (page - 1) * page_size
        end = start + page_size
        products_page = products[start:end]

        data = {
            "products": ProductListSerializer(products_page, many=True, context={"request": request}).data,
            "total_count": total_count,
            "page": page,
            "page_size": page_size,
        }
        return Response({
            "success": True, "user_not_logged_in": False, "user_unauthorized": False,
            "data": data, "error": None,
        }, status=status.HTTP_200_OK)

    @handle_exceptions
    @check_authentication(required_role="admin")
    def create(self, request):
        serializer = ProductDetailSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({
                "success": False, "user_not_logged_in": False, "user_unauthorized": False,
                "data": None, "error": serializer.errors,
            }, status=status.HTTP_400_BAD_REQUEST)

        product = serializer.save()
        return Response({
            "success": True, "user_not_logged_in": False, "user_unauthorized": False,
            "data": {"product": ProductDetailSerializer(product, context={"request": request}).data},
            "error": None,
        }, status=status.HTTP_201_CREATED)

    @handle_exceptions
    @check_authentication(required_role="admin")
    def update(self, request, pk):
        product = Product.objects.filter(pk=pk).first()
        if not product:
            return Response({
                "success": False, "user_not_logged_in": False, "user_unauthorized": False,
                "data": None, "error": "Product not found."
            }, status=status.HTTP_404_NOT_FOUND)

        serializer = ProductDetailSerializer(product, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response({
                "success": False, "user_not_logged_in": False, "user_unauthorized": False,
                "data": None, "error": serializer.errors,
            }, status=status.HTTP_400_BAD_REQUEST)

        serializer.save()
        return Response({
            "success": True, "user_not_logged_in": False, "user_unauthorized": False,
            "data": {"product": ProductDetailSerializer(product, context={"request": request}).data},
            "error": None,
        }, status=status.HTTP_200_OK)

    @handle_exceptions
    @check_authentication(required_role="admin")
    def destroy(self, request, pk):
        product = Product.objects.filter(pk=pk).first()
        if not product:
            return Response({
                "success": False, "user_not_logged_in": False, "user_unauthorized": False,
                "data": None, "error": "Product not found."
            }, status=status.HTTP_404_NOT_FOUND)

        product.delete()
        return Response({
            "success": True, "user_not_logged_in": False, "user_unauthorized": False,
            "data": {"id": pk, "deleted": True}, "error": None,
        }, status=status.HTTP_200_OK)


# ─────────────────────────────────────────────
# Product Images — multipart upload
# ─────────────────────────────────────────────
class ProductImageViewSet(viewsets.ViewSet):
    parser_classes = (MultiPartParser, FormParser, JSONParser)

    @handle_exceptions
    @check_authentication(required_role="admin")
    def create(self, request):
        serializer = ProductImageSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({
                "success": False, "user_not_logged_in": False, "user_unauthorized": False,
                "data": None, "error": serializer.errors,
            }, status=status.HTTP_400_BAD_REQUEST)

        image = serializer.save()
        return Response({
            "success": True, "user_not_logged_in": False, "user_unauthorized": False,
            "data": {"image": ProductImageSerializer(image, context={"request": request}).data},
            "error": None,
        }, status=status.HTTP_201_CREATED)

    @handle_exceptions
    @check_authentication(required_role="admin")
    def update(self, request, pk):
        image = ProductImage.objects.filter(pk=pk).first()
        if not image:
            return Response({
                "success": False, "user_not_logged_in": False, "user_unauthorized": False,
                "data": None, "error": "Image not found."
            }, status=status.HTTP_404_NOT_FOUND)

        serializer = ProductImageSerializer(image, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response({
                "success": False, "user_not_logged_in": False, "user_unauthorized": False,
                "data": None, "error": serializer.errors,
            }, status=status.HTTP_400_BAD_REQUEST)

        serializer.save()
        return Response({
            "success": True, "user_not_logged_in": False, "user_unauthorized": False,
            "data": {"image": serializer.data}, "error": None,
        }, status=status.HTTP_200_OK)

    @handle_exceptions
    @check_authentication(required_role="admin")
    def destroy(self, request, pk):
        image = ProductImage.objects.filter(pk=pk).first()
        if not image:
            return Response({
                "success": False, "user_not_logged_in": False, "user_unauthorized": False,
                "data": None, "error": "Image not found."
            }, status=status.HTTP_404_NOT_FOUND)

        image.delete()
        return Response({
            "success": True, "user_not_logged_in": False, "user_unauthorized": False,
            "data": {"id": pk, "deleted": True}, "error": None,
        }, status=status.HTTP_200_OK)


# ─────────────────────────────────────────────
# Product Variants (Color + Size style combinations)
# ─────────────────────────────────────────────
class ProductVariantViewSet(viewsets.ViewSet):

    @handle_exceptions
    def list(self, request):
        product_id = request.query_params.get("product")
        variants = ProductVariant.objects.all()
        if product_id:
            variants = variants.filter(product_id=product_id)

        return Response({
            "success": True, "user_not_logged_in": False, "user_unauthorized": False,
            "data": {"variants": ProductVariantSerializer(variants, many=True).data}, "error": None,
        }, status=status.HTTP_200_OK)

    @handle_exceptions
    @check_authentication(required_role="admin")
    def create(self, request):
        serializer = ProductVariantSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({
                "success": False, "user_not_logged_in": False, "user_unauthorized": False,
                "data": None, "error": serializer.errors,
            }, status=status.HTTP_400_BAD_REQUEST)

        variant = serializer.save()
        return Response({
            "success": True, "user_not_logged_in": False, "user_unauthorized": False,
            "data": {"variant": ProductVariantSerializer(variant).data}, "error": None,
        }, status=status.HTTP_201_CREATED)

    @handle_exceptions
    @check_authentication(required_role="admin")
    def update(self, request, pk):
        variant = ProductVariant.objects.filter(pk=pk).first()
        if not variant:
            return Response({
                "success": False, "user_not_logged_in": False, "user_unauthorized": False,
                "data": None, "error": "Variant not found."
            }, status=status.HTTP_404_NOT_FOUND)

        serializer = ProductVariantSerializer(variant, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response({
                "success": False, "user_not_logged_in": False, "user_unauthorized": False,
                "data": None, "error": serializer.errors,
            }, status=status.HTTP_400_BAD_REQUEST)

        serializer.save()
        return Response({
            "success": True, "user_not_logged_in": False, "user_unauthorized": False,
            "data": {"variant": serializer.data}, "error": None,
        }, status=status.HTTP_200_OK)

    @handle_exceptions
    @check_authentication(required_role="admin")
    def destroy(self, request, pk):
        variant = ProductVariant.objects.filter(pk=pk).first()
        if not variant:
            return Response({
                "success": False, "user_not_logged_in": False, "user_unauthorized": False,
                "data": None, "error": "Variant not found."
            }, status=status.HTTP_404_NOT_FOUND)

        variant.delete()
        return Response({
            "success": True, "user_not_logged_in": False, "user_unauthorized": False,
            "data": {"id": pk, "deleted": True}, "error": None,
        }, status=status.HTTP_200_OK)
