# Generated by Django 4.1.2 on 2022-12-26 19:33

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="Author",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("name", models.CharField(max_length=70, unique=True)),
                ("email", models.EmailField(max_length=70, unique=True)),
            ],
        ),
        migrations.CreateModel(
            name="Gdoc",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "google_id",
                    models.CharField(default="", max_length=100, unique=True),
                ),
                ("title", models.CharField(default="", max_length=70)),
                ("description", models.CharField(default="", max_length=200)),
                ("slug", models.CharField(default="", max_length=200)),
                ("status", models.CharField(default="draft", max_length=10)),
                ("published", models.BooleanField(default=False)),
            ],
            options={
                "unique_together": {("slug", "status")},
            },
        ),
        migrations.CreateModel(
            name="GdocAuthor",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("role", models.CharField(default="author", max_length=20)),
                (
                    "author",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        to="knowledgebase.author",
                    ),
                ),
                (
                    "gdoc",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        to="knowledgebase.gdoc",
                    ),
                ),
            ],
        ),
    ]
