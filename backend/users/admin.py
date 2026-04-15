from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from users.models import Follow, Profile, User


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    fieldsets = DjangoUserAdmin.fieldsets + (
        ("MVP", {"fields": ("is_creator", "created_at")}),
    )
    readonly_fields = ("created_at",)


admin.site.register(Profile)
admin.site.register(Follow)
