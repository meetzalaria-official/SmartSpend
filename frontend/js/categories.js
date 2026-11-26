/* ==========================================================================
   SmartSpend · Categories controller
   Add, edit and remove the income and expense categories used across the app.
   ========================================================================== */
(function (window) {
  "use strict";

  const SS = window.SS;
  const ui = SS.ui;
  const data = SS.data;

  ui.ready(async function () {
    const ctx = await SS.shell.mount({
      active: "categories",
      title: "Categories",
      subtitle: "Organise income and expense categories",
    });
    if (!ctx) return;

    const state = {
      editingCategory: null,
      categoryType: "expense",
      categoryColor: data.COLOR_CHOICES[0],
      categoryIcon: "tag",
    };

    const elements = {
      addCategory: document.getElementById("add-category"),
      categoryGroups: document.getElementById("category-groups"),
      categoryDialog: document.getElementById("category-dialog"),
      categoryTitle: document.getElementById("category-dialog-title"),
      categorySubtitle: document.getElementById("category-dialog-subtitle"),
      categoryForm: document.getElementById("category-form"),
      categoryAlert: document.getElementById("category-alert"),
      categoryName: document.getElementById("category-name"),
      categoryNameError: document.getElementById("category-name-error"),
      categoryTypeButtons: Array.from(document.querySelectorAll("[data-category-type]")),
      categoryColors: document.getElementById("category-colors"),
      categoryIcons: document.getElementById("category-icons"),
      categorySave: document.getElementById("category-save"),
    };

    function escapeHtml(value) {
      return String(value == null ? "" : value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    /* ----------------------------------------------------------------------
       Categories
       ---------------------------------------------------------------------- */
    function categoryRow(category, count) {
      const used = count || 0;
      return `
        <div class="category-row" data-category-id="${escapeHtml(category.id)}">
          <span class="category-row__icon" style="color:${category.color};background:${category.color}1f">
            <svg class="icon icon--sm" aria-hidden="true"><use href="#i-${escapeHtml(
              category.icon || "tag"
            )}"></use></svg>
          </span>
          <span class="category-row__name">${escapeHtml(category.name)}</span>
          <span class="category-row__count">${used} entr${used === 1 ? "y" : "ies"}</span>
          <button class="icon-action" type="button" data-category-edit="${escapeHtml(
            category.id
          )}" aria-label="Edit ${escapeHtml(category.name)}" title="Edit category">
            <svg class="icon icon--sm" aria-hidden="true"><use href="#i-edit"></use></svg>
          </button>
          ${
            category.system
              ? `<span class="icon-action" title="This category cannot be deleted" aria-hidden="true">
                   <svg class="icon icon--sm"><use href="#i-lock"></use></svg>
                 </span>`
              : `<button class="icon-action icon-action--danger" type="button" data-category-delete="${escapeHtml(
                  category.id
                )}" aria-label="Delete ${escapeHtml(category.name)}" title="Delete category">
                   <svg class="icon icon--sm" aria-hidden="true"><use href="#i-trash"></use></svg>
                 </button>`
          }
        </div>`;
    }

    async function refreshCategories() {
      const [categories, usage] = await Promise.all([
        SS.finance.categories.list("all"),
        SS.finance.categories.usage(),
      ]);

      const groups = [
        {
          key: "expense",
          label: "Expense categories",
          items: categories.filter((category) => category.type === "expense"),
        },
        {
          key: "income",
          label: "Income categories",
          items: categories.filter((category) => category.type === "income"),
        },
      ];

      elements.categoryGroups.innerHTML = groups
        .map(
          (group) => `
          <div class="category-group">
            <div class="category-group__head">
              <strong>${group.label}</strong>
              <span class="chip">${group.items.length}</span>
            </div>
            <div class="category-list">
              ${
                group.items.length
                  ? group.items.map((category) => categoryRow(category, usage[category.id])).join("")
                  : `<p class="muted" style="font-size:0.74rem">No ${group.key} categories yet.</p>`
              }
            </div>
          </div>`
        )
        .join("");

      elements.categoryGroups.querySelectorAll("[data-category-edit]").forEach((button) => {
        button.addEventListener("click", () => {
          const category = categories.find((item) => item.id === button.getAttribute("data-category-edit"));
          if (category) openCategoryDialog(category);
        });
      });

      elements.categoryGroups.querySelectorAll("[data-category-delete]").forEach((button) => {
        button.addEventListener("click", () => deleteCategory(button.getAttribute("data-category-delete")));
      });
    }

    async function deleteCategory(id) {
      const categories = await SS.finance.categories.list("all");
      const category = categories.find((item) => item.id === id);
      if (!category) return;

      const confirmed = await ui.confirm({
        title: "Delete this category?",
        message: `${category.name} will be removed. Categories used by transactions or budgets cannot be deleted until those entries are moved.`,
        confirmLabel: "Delete category",
        danger: true,
        icon: "trash",
      });
      if (!confirmed) return;

      try {
        await SS.finance.categories.remove(id);
        ui.toast.success("Category deleted", `${category.name} has been removed.`);
        await refreshCategories();
      } catch (error) {
        ui.toast.error(
          "Could not delete category",
          (error && error.message) || "Please try again."
        );
      }
    }

    function renderCategoryChoices() {
      elements.categoryColors.innerHTML = data.COLOR_CHOICES.map(
        (color) =>
          `<button class="color-swatch" type="button" data-color="${color}" style="background:${color}" aria-label="Colour ${color}"></button>`
      ).join("");

      elements.categoryIcons.innerHTML = data.ICON_CHOICES.map(
        (icon) => `
          <button class="icon-choice__button" type="button" data-icon="${icon}" aria-label="Icon ${icon}">
            <svg class="icon icon--sm" aria-hidden="true"><use href="#i-${icon}"></use></svg>
          </button>`
      ).join("");

      elements.categoryColors.querySelectorAll("[data-color]").forEach((button) => {
        button.addEventListener("click", () => {
          state.categoryColor = button.getAttribute("data-color");
          updateCategoryChoices();
        });
      });

      elements.categoryIcons.querySelectorAll("[data-icon]").forEach((button) => {
        button.addEventListener("click", () => {
          state.categoryIcon = button.getAttribute("data-icon");
          updateCategoryChoices();
        });
      });
    }

    function updateCategoryChoices() {
      elements.categoryColors.querySelectorAll("[data-color]").forEach((button) => {
        const selected = button.getAttribute("data-color") === state.categoryColor;
        button.classList.toggle("is-selected", selected);
        button.setAttribute("aria-pressed", selected ? "true" : "false");
      });
      elements.categoryIcons.querySelectorAll("[data-icon]").forEach((button) => {
        const selected = button.getAttribute("data-icon") === state.categoryIcon;
        button.classList.toggle("is-selected", selected);
        button.setAttribute("aria-pressed", selected ? "true" : "false");
      });
    }

    function renderCategoryType() {
      elements.categoryTypeButtons.forEach((button) => {
        const type = button.getAttribute("data-category-type");
        const active = type === state.categoryType;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", active ? "true" : "false");
        button.disabled = Boolean(state.editingCategory);
      });
    }

    function clearCategoryErrors() {
      elements.categoryNameError.textContent = "";
      elements.categoryName.closest(".field").classList.remove("is-invalid");
      ui.hideAlert(elements.categoryAlert);
    }

    function openCategoryDialog(category) {
      state.editingCategory = category || null;
      state.categoryType = category ? category.type : "expense";
      state.categoryColor = category ? category.color : data.COLOR_CHOICES[0];
      state.categoryIcon = category ? category.icon : "tag";

      elements.categoryTitle.textContent = category ? "Edit category" : "Add category";
      elements.categorySubtitle.textContent = category
        ? `${category.type === "income" ? "Income" : "Expense"} category · categories in use cannot be deleted.`
        : "Give it a name, colour and icon.";
      elements.categorySave.querySelector(".btn__label").textContent = category
        ? "Save changes"
        : "Save category";
      elements.categoryName.value = category ? category.name : "";

      clearCategoryErrors();
      renderCategoryType();
      updateCategoryChoices();
      ui.setLoading(elements.categorySave, false);
      ui.openDialog(elements.categoryDialog);
      window.setTimeout(() => elements.categoryName.focus(), 60);
    }

    elements.categoryTypeButtons.forEach((button) => {
      button.addEventListener("click", () => {
        if (state.editingCategory) return;
        state.categoryType = button.getAttribute("data-category-type");
        renderCategoryType();
      });
    });

    elements.addCategory.addEventListener("click", () => openCategoryDialog(null));

    elements.categoryDialog.addEventListener("close", () => {
      elements.categoryForm.reset();
      state.editingCategory = null;
      clearCategoryErrors();
      ui.setLoading(elements.categorySave, false);
    });

    elements.categoryForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      clearCategoryErrors();

      const name = elements.categoryName.value.trim();
      if (name.length < 2) {
        ui.showFieldError(elements.categoryName, "Use at least 2 characters for the category name.");
        ui.shake(elements.categoryForm);
        elements.categoryName.focus();
        return;
      }

      ui.setLoading(elements.categorySave, true);
      try {
        const payload = {
          name,
          color: state.categoryColor,
          icon: state.categoryIcon,
        };

        if (state.editingCategory) {
          await SS.finance.categories.update(state.editingCategory.id, payload);
        } else {
          await SS.finance.categories.create(
            Object.assign({}, payload, { type: state.categoryType })
          );
        }

        const editing = Boolean(state.editingCategory);
        ui.closeDialog(elements.categoryDialog);
        ui.toast.success(
          editing ? "Category updated" : "Category created",
          `${name} is ready to use in transactions and budgets.`
        );
        await refreshCategories();
      } catch (error) {
        if (error && error.field === "name") {
          ui.showFieldError(elements.categoryName, error.message);
        } else {
          ui.showAlert(
            elements.categoryAlert,
            "error",
            (error && error.message) || "Could not save this category. Please try again.",
            "Could not save category"
          );
        }
        ui.shake(elements.categoryForm);
      } finally {
        ui.setLoading(elements.categorySave, false);
      }
    });

    /* ----------------------------------------------------------------------
       Boot
       ---------------------------------------------------------------------- */
    renderCategoryChoices();
    renderCategoryType();
    updateCategoryChoices();

    try {
      await refreshCategories();
    } catch (error) {
      ui.toast.error(
        "Could not load categories",
        (error && error.message) || "Reload the page and try again."
      );
    }

    document.addEventListener("ss:data-changed", () => {
      refreshCategories().catch(() => {});
    });
  });
})(window);
