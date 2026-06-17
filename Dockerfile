FROM python:3.10

# Set working directory
WORKDIR /code

# Copy requirements
COPY ./backend/requirements.txt /code/requirements.txt

# Install dependencies
RUN pip install --no-cache-dir --upgrade -r /code/requirements.txt

# Create necessary directories
RUN mkdir -p /code/databases/csv /code/databases/schema /code/sample_data

# Copy the entire project
COPY . /code/

# Hugging Face Spaces run on port 7860 by default
ENV PORT=7860

# Run the FastAPI app with Uvicorn
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "7860"]
