-- CreateIndex
CREATE INDEX `page_view_event_created_at_path_visitor_id_idx` ON `page_view_event`(`created_at`, `path`, `visitor_id`);

-- CreateIndex
CREATE INDEX `point_transaction_type_created_at_idx` ON `point_transaction`(`type`, `created_at`);

-- CreateIndex
CREATE INDEX `shop_order_created_at_idx` ON `shop_order`(`created_at`);

-- CreateIndex
CREATE INDEX `user_created_at_idx` ON `user`(`created_at`);
