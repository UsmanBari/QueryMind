import os
import sqlite3
import random
from datetime import datetime, timedelta

def main():
    print("[generate_ecommerce_db] Generating ecommerce.db...")
    
    current_dir = os.path.dirname(os.path.abspath(__file__))
    db_path = os.path.join(current_dir, "ecommerce.db")
    schema_path = os.path.join(current_dir, "ecommerce_schema.sql")
    
    # Remove existing db if any
    if os.path.exists(db_path):
        os.remove(db_path)
        
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Read and execute schema SQL
    with open(schema_path, "r") as f:
        schema_sql = f.read()
    
    cursor.executescript(schema_sql)
    conn.commit()
    
    # 1. Generate 20 customers
    customer_names = [
        "Alice Smith", "Bob Johnson", "Charlie Brown", "Diana Prince", 
        "Evan Wright", "Fiona Gallagher", "George Costanza", "Hannah Abbott", 
        "Ian Malcolm", "Julia Roberts", "Kevin Bacon", "Laura Croft", 
        "Michael Scott", "Nancy Drew", "Oscar Martinez", "Pamela Beesly", 
        "Quentin Tarantino", "Rachel Green", "Steve Rogers", "Tony Stark"
    ]
    cities = ["New York", "Los Angeles", "Chicago", "London", "Paris", "Tokyo", "Sydney", "Toronto", "Berlin", "Mumbai"]
    countries = ["USA", "USA", "USA", "UK", "France", "Japan", "Australia", "Canada", "Germany", "India"]
    
    # Let's seed random to be deterministic
    random.seed(42)
    
    customers_data = []
    base_date = datetime(2025, 1, 1)
    for i, name in enumerate(customer_names):
        customer_id = i + 1
        email = name.lower().replace(" ", ".") + "@example.com"
        city_idx = random.randint(0, len(cities) - 1)
        city = cities[city_idx]
        country = countries[city_idx] # map city to country
        signup_days = random.randint(0, 360)
        signup_date = (base_date + timedelta(days=signup_days)).strftime("%Y-%m-%d")
        customers_data.append((customer_id, name, email, city, country, signup_date))
        
    cursor.executemany(
        "INSERT INTO customers (customer_id, name, email, city, country, signup_date) VALUES (?, ?, ?, ?, ?, ?)",
        customers_data
    )
    
    # 2. Generate 15 products (10-500 range prices)
    products_source = [
        ("Wireless Earbuds", "Electronics", 79.99),
        ("Smart Watch", "Electronics", 199.99),
        ("Sony Headset", "Electronics", 149.99),
        ("Mechanical Keyboard", "Electronics", 129.99),
        ("Nike Sneakers", "Clothing", 89.99),
        ("Levi Jeans", "Clothing", 59.99),
        ("Woolen Sweater", "Clothing", 45.00),
        ("Leather Jacket", "Clothing", 249.99),
        ("Dune Novel", "Books", 14.99),
        ("Python Guide", "Books", 29.99),
        ("Cookware Set", "Home", 189.99),
        ("Desk Lamp", "Home", 35.00),
        ("Office Chair", "Home", 179.99),
        ("Coffee Maker", "Home", 99.99),
        ("Electric Kettle", "Home", 24.99)
    ]
    
    products_data = []
    for i, (name, category, price) in enumerate(products_source):
        product_id = i + 1
        stock = random.randint(10, 150)
        products_data.append((product_id, name, category, price, stock))
        
    cursor.executemany(
        "INSERT INTO products (product_id, name, category, price, stock_quantity) VALUES (?, ?, ?, ?, ?)",
        products_data
    )
    
    # 3. Generate 40 orders
    statuses = ["Delivered", "Delivered", "Delivered", "Pending", "Cancelled"]
    payments = ["Credit Card", "PayPal", "Cash on Delivery"]
    orders_data = []
    base_order_date = datetime(2026, 1, 1)
    
    for order_id in range(1, 41):
        customer_id = random.randint(1, 20)
        order_days = random.randint(0, 160)
        order_date = (base_order_date + timedelta(days=order_days)).strftime("%Y-%m-%d")
        status = random.choice(statuses)
        payment_method = random.choice(payments)
        orders_data.append((order_id, customer_id, order_date, status, payment_method))
        
    cursor.executemany(
        "INSERT INTO orders (order_id, customer_id, order_date, status, payment_method) VALUES (?, ?, ?, ?, ?)",
        orders_data
    )
    
    # 4. Generate 80 order_items
    item_id = 1
    order_items_data = []
    
    # Ensure every order has at least 1 item
    for order_id in range(1, 41):
        num_items = random.randint(1, 3)
        chosen_products = random.sample(range(1, 16), num_items)
        for prod_id in chosen_products:
            prod_price = products_data[prod_id - 1][3]
            qty = random.randint(1, 4)
            order_items_data.append((item_id, order_id, prod_id, qty, prod_price))
            item_id += 1
            if len(order_items_data) == 80:
                break
        if len(order_items_data) == 80:
            break
            
    # If we still need to reach 80, add more to random orders
    while len(order_items_data) < 80:
        ord_id = random.randint(1, 40)
        prod_id = random.randint(1, 15)
        prod_price = products_data[prod_id - 1][3]
        qty = random.randint(1, 4)
        # Check if already in order to keep unique if desired, but not strictly database constrained except PK
        order_items_data.append((item_id, ord_id, prod_id, qty, prod_price))
        item_id += 1
        
    cursor.executemany(
        "INSERT INTO order_items (item_id, order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?, ?)",
        order_items_data
    )
    
    # 5. Generate 30 reviews
    reviews_data = []
    base_review_date = datetime(2026, 1, 15)
    
    for review_id in range(1, 31):
        customer_id = random.randint(1, 20)
        product_id = random.randint(1, 15)
        rating = random.randint(1, 5)
        review_days = random.randint(10, 150)
        review_date = (base_review_date + timedelta(days=review_days)).strftime("%Y-%m-%d")
        reviews_data.append((review_id, customer_id, product_id, rating, review_date))
        
    cursor.executemany(
        "INSERT INTO reviews (review_id, customer_id, product_id, rating, review_date) VALUES (?, ?, ?, ?, ?)",
        reviews_data
    )
    
    conn.commit()
    conn.close()
    print("[generate_ecommerce_db] ecommerce.db created successfully!")

if __name__ == "__main__":
    main()
